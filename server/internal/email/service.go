package email

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

const defaultBaseURL = "https://api.postmarkapp.com"

// Service provides helpers for sending transactional email via Postmark.
type Service struct {
	httpClient    *http.Client
	serverToken   string
	fromEmail     string
	fromName      string
	messageStream string
	baseURL       string
}

// Config defines Postmark configuration.
type Config struct {
	ServerToken   string
	FromEmail     string
	FromName      string
	MessageStream string
	BaseURL       string
	Timeout       time.Duration
}

// SendEmailInput represents the payload for sending a standard email.
type SendEmailInput struct {
	To            string
	Subject       string
	HTMLBody      string
	TextBody      string
	Tag           string
	Metadata      map[string]string
	MessageStream string
}

// SendTemplateInput represents the payload for sending a template-based email.
type SendTemplateInput struct {
	To            string
	TemplateID    int64
	TemplateAlias string
	Model         any
	Tag           string
	Metadata      map[string]string
	MessageStream string
}

// NewServiceFromEnv builds a Service using environment variables.
func NewServiceFromEnv() (*Service, error) {
	cfg := Config{
		ServerToken:   strings.TrimSpace(os.Getenv("POSTMARK_SERVER_TOKEN")),
		FromEmail:     strings.TrimSpace(os.Getenv("POSTMARK_FROM_EMAIL")),
		FromName:      strings.TrimSpace(os.Getenv("POSTMARK_FROM_NAME")),
		MessageStream: strings.TrimSpace(os.Getenv("POSTMARK_MESSAGE_STREAM")),
		BaseURL:       strings.TrimSpace(os.Getenv("POSTMARK_BASE_URL")),
		Timeout:       10 * time.Second,
	}

	return NewService(cfg)
}

// NewService instantiates the Postmark service.
func NewService(cfg Config) (*Service, error) {
	if cfg.ServerToken == "" {
		return nil, errors.New("POSTMARK_SERVER_TOKEN is required")
	}
	if cfg.FromEmail == "" {
		return nil, errors.New("POSTMARK_FROM_EMAIL is required")
	}
	if cfg.MessageStream == "" {
		cfg.MessageStream = "outbound"
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 10 * time.Second
	}

	client := &http.Client{
		Timeout: cfg.Timeout,
	}

	return &Service{
		httpClient:    client,
		serverToken:   cfg.ServerToken,
		fromEmail:     cfg.FromEmail,
		fromName:      cfg.FromName,
		messageStream: cfg.MessageStream,
		baseURL:       cfg.BaseURL,
	}, nil
}

// SendEmail sends a basic transactional email through Postmark.
func (s *Service) SendEmail(ctx context.Context, input SendEmailInput) error {
	if input.To == "" {
		return errors.New("recipient address is required")
	}
	if input.Subject == "" {
		return errors.New("subject is required")
	}
	if input.HTMLBody == "" && input.TextBody == "" {
		return errors.New("either HTMLBody or TextBody must be provided")
	}

	payload := map[string]any{
		"From":          s.formatFromAddress(),
		"To":            input.To,
		"Subject":       input.Subject,
		"HtmlBody":      input.HTMLBody,
		"TextBody":      input.TextBody,
		"Tag":           input.Tag,
		"MessageStream": s.resolveMessageStream(input.MessageStream),
		"Metadata":      input.Metadata,
	}

	return s.send(ctx, "/email", payload)
}

// SendTemplateEmail delivers a Postmark template-based message.
func (s *Service) SendTemplateEmail(ctx context.Context, input SendTemplateInput) error {
	if input.To == "" {
		return errors.New("recipient address is required")
	}
	if input.TemplateID == 0 && input.TemplateAlias == "" {
		return errors.New("either TemplateID or TemplateAlias must be provided")
	}

	payload := map[string]any{
		"From":          s.formatFromAddress(),
		"To":            input.To,
		"TemplateModel": input.Model,
		"Tag":           input.Tag,
		"MessageStream": s.resolveMessageStream(input.MessageStream),
		"Metadata":      input.Metadata,
	}

	if input.TemplateID != 0 {
		payload["TemplateId"] = input.TemplateID
	}
	if input.TemplateAlias != "" {
		payload["TemplateAlias"] = input.TemplateAlias
	}

	return s.send(ctx, "/email/withTemplate", payload)
}

func (s *Service) send(ctx context.Context, path string, payload map[string]any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s%s", s.baseURL, path), bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("X-Postmark-Server-Token", s.serverToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var apiErr struct {
			ErrorCode int    `json:"ErrorCode"`
			Message   string `json:"Message"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
			return fmt.Errorf("postmark request failed with status %d", resp.StatusCode)
		}

		return fmt.Errorf("postmark error (%d): %s", apiErr.ErrorCode, apiErr.Message)
	}

	return nil
}

func (s *Service) formatFromAddress() string {
	if s.fromName == "" {
		return s.fromEmail
	}

	return fmt.Sprintf("%s <%s>", s.fromName, s.fromEmail)
}

func (s *Service) resolveMessageStream(stream string) string {
	if strings.TrimSpace(stream) != "" {
		return stream
	}

	return s.messageStream
}
