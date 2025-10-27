package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsConfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
)

const (
	defaultUploadPrefix = "uploads"
	defaultPresignTTL   = 15 * time.Minute
	maxFileNameLength   = 200
)

// ErrServiceDisabled is returned when the storage service cannot be initialised from the environment.
var ErrServiceDisabled = errors.New("storage service disabled")

// Service exposes helpers for working with S3-compatible object storage such as DigitalOcean Spaces.
type Service struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucket        string
	originBase    string
	uploadPrefix  string
	maxUploadSize int64
}

// Config describes the required configuration for the storage service.
type Config struct {
	Endpoint   string
	OriginBase string
	Region     string
	Bucket     string
	AccessKey  string
	SecretKey  string
	Prefix     string
	MaxSizeMB  int64
}

// UploadSignature describes the data the client needs to upload a file directly to object storage.
type UploadSignature struct {
	UploadURL string            `json:"upload_url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	ObjectKey string            `json:"object_key"`
	FileURL   string            `json:"file_url"`
	ExpiresAt time.Time         `json:"expires_at"`
}

// UploadResult captures metadata after directly uploading a file through the storage service.
type UploadResult struct {
	ObjectKey string `json:"object_key"`
	FileURL   string `json:"file_url"`
}

// NewService initialises a storage Service from a Config definition.
func NewService(ctx context.Context, cfg Config) (*Service, error) {
	if cfg.Endpoint == "" || cfg.Region == "" || cfg.Bucket == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return nil, ErrServiceDisabled
	}

	endpointURL := cfg.Endpoint
	if !strings.HasPrefix(endpointURL, "http") {
		endpointURL = "https://" + endpointURL
	}

	resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:           endpointURL,
			SigningRegion: cfg.Region,
		}, nil
	})

	awsCfg, err := awsConfig.LoadDefaultConfig(
		ctx,
		awsConfig.WithRegion(cfg.Region),
		awsConfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, "")),
		awsConfig.WithEndpointResolverWithOptions(resolver),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = false
	})

	presign := s3.NewPresignClient(client)

	prefix := strings.Trim(cfg.Prefix, "/")
	if prefix == "" {
		prefix = defaultUploadPrefix
	}

	maxUploadSize := cfg.MaxSizeMB
	if maxUploadSize <= 0 {
		maxUploadSize = 100 // default to 100MB
	}

	return &Service{
		client:        client,
		presignClient: presign,
		bucket:        cfg.Bucket,
		originBase:    strings.TrimRight(cfg.OriginBase, "/"),
		uploadPrefix:  prefix,
		maxUploadSize: maxUploadSize * 1024 * 1024,
	}, nil
}

// NewServiceFromEnv builds a Service using environment variables.
func NewServiceFromEnv(ctx context.Context) (*Service, error) {
	cfg := Config{
		Endpoint:   strings.TrimSpace(os.Getenv("SPACES_ENDPOINT")),
		OriginBase: strings.TrimSpace(os.Getenv("SPACES_ORIGIN")),
		Region:     strings.TrimSpace(os.Getenv("SPACES_REGION")),
		Bucket:     strings.TrimSpace(os.Getenv("SPACES_BUCKET")),
		AccessKey:  strings.TrimSpace(os.Getenv("SPACES_ACCESS_KEY")),
		SecretKey:  strings.TrimSpace(os.Getenv("SPACES_SECRET_KEY")),
		Prefix:     strings.TrimSpace(os.Getenv("SPACES_UPLOAD_PREFIX")),
	}

	if maxSize := strings.TrimSpace(os.Getenv("SPACES_MAX_UPLOAD_MB")); maxSize != "" {
		if parsed, err := parseInt64(maxSize); err == nil {
			cfg.MaxSizeMB = parsed
		}
	}

	service, err := NewService(ctx, cfg)
	if errors.Is(err, ErrServiceDisabled) {
		return nil, ErrServiceDisabled
	}

	if err != nil {
		return nil, err
	}

	return service, nil
}

// PresignUpload generates a pre-signed PUT URL that allows the caller to upload a file directly to storage.
func (s *Service) PresignUpload(ctx context.Context, fileName, contentType string, fileSize int64) (*UploadSignature, error) {
	if s == nil {
		return nil, ErrServiceDisabled
	}

	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if fileSize <= 0 {
		return nil, fmt.Errorf("file_size must be greater than zero")
	}

	if s.maxUploadSize > 0 && fileSize > s.maxUploadSize {
		return nil, fmt.Errorf("file exceeds max upload size of %d bytes", s.maxUploadSize)
	}

	safeName := sanitizeFileName(fileName)
	if safeName == "" {
		safeName = "file"
	}

	ext := filepath.Ext(safeName)
	key := path.Join(s.uploadPrefix, time.Now().UTC().Format("2006/01/02"), uuid.NewString()+strings.ToLower(ext))

	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
		ACL:         types.ObjectCannedACLPublicRead,
	}

	presignCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result, err := s.presignClient.PresignPutObject(presignCtx, input, s3.WithPresignExpires(defaultPresignTTL))
	if err != nil {
		return nil, fmt.Errorf("presign put object: %w", err)
	}

	headers := map[string]string{}
	for keyHeader, values := range result.SignedHeader {
		if len(values) == 0 {
			continue
		}
		headers[keyHeader] = values[0]
	}

	if contentType != "" {
		headers["Content-Type"] = contentType
	}

	fileURL := s.assetURL(key)

	return &UploadSignature{
		UploadURL: result.URL,
		Method:    httpMethodFromRequest(result.Method),
		Headers:   headers,
		ObjectKey: key,
		FileURL:   fileURL,
		ExpiresAt: time.Now().Add(defaultPresignTTL),
	}, nil
}

// UploadObject uploads the provided reader to object storage and returns the resulting metadata.
func (s *Service) UploadObject(ctx context.Context, fileName, contentType string, fileSize int64, body io.Reader) (*UploadResult, error) {
	if s == nil {
		return nil, ErrServiceDisabled
	}

	if fileSize <= 0 {
		return nil, fmt.Errorf("file_size must be greater than zero")
	}

	if s.maxUploadSize > 0 && fileSize > s.maxUploadSize {
		return nil, fmt.Errorf("file exceeds max upload size of %d bytes", s.maxUploadSize)
	}

	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	safeName := sanitizeFileName(fileName)
	if safeName == "" {
		safeName = "file"
	}

	ext := filepath.Ext(safeName)
	key := path.Join(s.uploadPrefix, time.Now().UTC().Format("2006/01/02"), uuid.NewString()+strings.ToLower(ext))

	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(fileSize),
		ACL:           types.ObjectCannedACLPublicRead,
	}

	if _, err := s.client.PutObject(ctx, input); err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}

	return &UploadResult{
		ObjectKey: key,
		FileURL:   s.assetURL(key),
	}, nil
}

// GetObject retrieves an object from storage and returns its body stream along with metadata.
func (s *Service) GetObject(ctx context.Context, objectKey string) (io.ReadCloser, int64, string, error) {
	if s == nil {
		return nil, 0, "", ErrServiceDisabled
	}

	objectKey = strings.TrimLeft(objectKey, "/")
	if objectKey == "" {
		return nil, 0, "", fmt.Errorf("object key is required")
	}

	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, 0, "", err
	}

	contentLength := int64(0)
	if output.ContentLength != nil {
		contentLength = *output.ContentLength
	}

	contentType := ""
	if output.ContentType != nil {
		contentType = *output.ContentType
	}

	return output.Body, contentLength, contentType, nil
}

// PresignAvatarUpload generates a pre-signed PUT URL for avatar uploads with a specific prefix.
func (s *Service) PresignAvatarUpload(ctx context.Context, fileName, contentType string, fileSize int64, avatarType string) (*UploadSignature, error) {
	if s == nil {
		return nil, ErrServiceDisabled
	}

	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	if fileSize <= 0 {
		return nil, fmt.Errorf("file_size must be greater than zero")
	}

	if s.maxUploadSize > 0 && fileSize > s.maxUploadSize {
		return nil, fmt.Errorf("file exceeds max upload size of %d bytes", s.maxUploadSize)
	}

	safeName := sanitizeFileName(fileName)
	if safeName == "" {
		safeName = "avatar"
	}

	ext := filepath.Ext(safeName)
	prefix := fmt.Sprintf("avatars/%s", avatarType)
	key := path.Join(prefix, time.Now().UTC().Format("2006/01/02"), uuid.NewString()+strings.ToLower(ext))

	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
		ACL:         types.ObjectCannedACLPublicRead,
	}

	presignCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	result, err := s.presignClient.PresignPutObject(presignCtx, input, s3.WithPresignExpires(defaultPresignTTL))
	if err != nil {
		return nil, fmt.Errorf("presign put object: %w", err)
	}

	headers := map[string]string{}
	for keyHeader, values := range result.SignedHeader {
		if len(values) == 0 {
			continue
		}
		headers[keyHeader] = values[0]
	}

	if contentType != "" {
		headers["Content-Type"] = contentType
	}

	fileURL := s.assetURL(key)

	return &UploadSignature{
		UploadURL: result.URL,
		Method:    httpMethodFromRequest(result.Method),
		Headers:   headers,
		ObjectKey: key,
		FileURL:   fileURL,
		ExpiresAt: time.Now().Add(defaultPresignTTL),
	}, nil
}

// UploadAvatarObject uploads an avatar to object storage with a specific prefix.
func (s *Service) UploadAvatarObject(ctx context.Context, fileName, contentType string, fileSize int64, body io.Reader, avatarType string) (*UploadResult, error) {
	if s == nil {
		return nil, ErrServiceDisabled
	}

	if fileSize <= 0 {
		return nil, fmt.Errorf("file_size must be greater than zero")
	}

	if s.maxUploadSize > 0 && fileSize > s.maxUploadSize {
		return nil, fmt.Errorf("file exceeds max upload size of %d bytes", s.maxUploadSize)
	}

	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	safeName := sanitizeFileName(fileName)
	if safeName == "" {
		safeName = "avatar"
	}

	ext := filepath.Ext(safeName)
	prefix := fmt.Sprintf("avatars/%s", avatarType)
	key := path.Join(prefix, time.Now().UTC().Format("2006/01/02"), uuid.NewString()+strings.ToLower(ext))

	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(fileSize),
		ACL:           types.ObjectCannedACLPublicRead,
	}

	if _, err := s.client.PutObject(ctx, input); err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}

	return &UploadResult{
		ObjectKey: key,
		FileURL:   s.assetURL(key),
	}, nil
}

func (s *Service) assetURL(key string) string {
	if s.originBase == "" {
		return key
	}

	return fmt.Sprintf("%s/%s", s.originBase, strings.TrimLeft(key, "/"))
}

func sanitizeFileName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}

	if len(name) > maxFileNameLength {
		name = name[:maxFileNameLength]
	}

	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.' || r == '-' || r == '_':
			return r
		case r == ' ':
			return '-'
		default:
			return '-'
		}
	}, name)

	return strings.Trim(cleaned, "-.")
}

func parseInt64(value string) (int64, error) {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, err
	}
	return parsed, nil
}

func httpMethodFromRequest(method string) string {
	if strings.TrimSpace(method) == "" {
		return "PUT"
	}
	return strings.ToUpper(method)
}
