package queue

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"bafachat/internal/email"

	"github.com/hibiken/asynq"
)

const (
	// TypeEmailDelivery represents a task to deliver an email.
	TypeEmailDelivery = "email:deliver"
)

// Config holds Redis/Asynq configuration values.
type Config struct {
	Addr        string
	Password    string
	DB          int
	Concurrency int
}

// EmailTaskPayload defines the payload for email delivery tasks.
type EmailTaskPayload struct {
	To       string            `json:"to"`
	Subject  string            `json:"subject"`
	HTMLBody string            `json:"html_body,omitempty"`
	TextBody string            `json:"text_body,omitempty"`
	Tag      string            `json:"tag,omitempty"`
	Meta     map[string]string `json:"meta,omitempty"`
}

// ConfigFromEnv builds an Asynq configuration using environment variables.
func ConfigFromEnv() Config {
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		addr = "127.0.0.1:6379"
	}

	password := os.Getenv("REDIS_PASSWORD")

	db := 0
	if raw := strings.TrimSpace(os.Getenv("REDIS_DB")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			db = parsed
		}
	}

	concurrency := 5
	if raw := strings.TrimSpace(os.Getenv("ASYNQ_CONCURRENCY")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			concurrency = parsed
		}
	}

	return Config{
		Addr:        addr,
		Password:    password,
		DB:          db,
		Concurrency: concurrency,
	}
}

// NewClient returns a new Asynq client for enqueuing tasks.
func NewClient(cfg Config) (*asynq.Client, error) {
	if cfg.Addr == "" {
		return nil, errors.New("redis address is required")
	}

	opts := asynq.RedisClientOpt{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	}

	return asynq.NewClient(opts), nil
}

// NewServer constructs an Asynq server instance with the provided configuration.
func NewServer(cfg Config) (*asynq.Server, error) {
	if cfg.Addr == "" {
		return nil, errors.New("redis address is required")
	}

	opts := asynq.RedisClientOpt{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	}

	server := asynq.NewServer(opts, asynq.Config{
		Concurrency: cfg.Concurrency,
		RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
			// Exponential backoff with sane defaults.
			return time.Duration(n*n) * time.Second
		},
	})

	return server, nil
}

// NewMux registers queue handlers and returns a ServeMux.
func NewMux(emailService *email.Service) *asynq.ServeMux {
	mux := asynq.NewServeMux()

	mux.HandleFunc(TypeEmailDelivery, func(ctx context.Context, task *asynq.Task) error {
		return handleEmailDelivery(ctx, task, emailService)
	})

	return mux
}

// NewEmailTask builds an Asynq task payload for sending an email.
func NewEmailTask(payload EmailTaskPayload) (*asynq.Task, error) {
	if payload.To == "" {
		return nil, errors.New("email recipient is required")
	}
	if payload.Subject == "" {
		return nil, errors.New("email subject is required")
	}
	if payload.HTMLBody == "" && payload.TextBody == "" {
		return nil, errors.New("email body is required")
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	return asynq.NewTask(TypeEmailDelivery, body), nil
}

func handleEmailDelivery(ctx context.Context, task *asynq.Task, emailService *email.Service) error {
	var payload EmailTaskPayload
	if err := json.Unmarshal(task.Payload(), &payload); err != nil {
		return fmt.Errorf("unable to decode email payload: %w", err)
	}

	if emailService == nil {
		return errors.New("email service not configured")
	}

	sendInput := email.SendEmailInput{
		To:       payload.To,
		Subject:  payload.Subject,
		HTMLBody: payload.HTMLBody,
		TextBody: payload.TextBody,
		Tag:      payload.Tag,
		Metadata: payload.Meta,
	}

	if err := emailService.SendEmail(ctx, sendInput); err != nil {
		return fmt.Errorf("failed to send email via postmark: %w", err)
	}

	return nil
}
