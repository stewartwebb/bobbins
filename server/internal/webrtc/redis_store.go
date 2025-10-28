package webrtc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const defaultRedisTokenPrefix = "webrtc:session:"

// redisTokenStore persists session tokens in Redis so multiple server
// instances can share the same token namespace.
type redisTokenStore struct {
	client *redis.Client
	prefix string
}

// NewRedisTokenStore wraps a redis.Client in a TokenStore implementation. The
// caller retains ownership of the client lifecycle (closing on shutdown).
func NewRedisTokenStore(client *redis.Client, prefix string) (TokenStore, error) {
	if client == nil {
		return nil, errors.New("redis client is required")
	}

	if prefix == "" {
		prefix = defaultRedisTokenPrefix
	}

	return &redisTokenStore{
		client: client,
		prefix: prefix,
	}, nil
}

func (s *redisTokenStore) key(token string) string {
	return s.prefix + token
}

func (s *redisTokenStore) Save(session SessionToken) error {
	payload, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("marshal session token: %w", err)
	}

	ttl := time.Until(session.ExpiresAt)
	if ttl <= 0 {
		ttl = time.Second
	}

	if err := s.client.Set(context.Background(), s.key(session.Token), payload, ttl).Err(); err != nil {
		return fmt.Errorf("store session token: %w", err)
	}
	return nil
}

func (s *redisTokenStore) Get(token string) (SessionToken, error) {
	result, err := s.client.Get(context.Background(), s.key(token)).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return SessionToken{}, ErrTokenNotFound
		}
		return SessionToken{}, fmt.Errorf("load session token: %w", err)
	}

	var session SessionToken
	if err := json.Unmarshal(result, &session); err != nil {
		return SessionToken{}, fmt.Errorf("decode session token: %w", err)
	}

	return session, nil
}

func (s *redisTokenStore) Delete(token string) error {
	if err := s.client.Del(context.Background(), s.key(token)).Err(); err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("delete session token: %w", err)
	}
	return nil
}

func (s *redisTokenStore) Cleanup(time.Time) {
	// Redis key expiration is handled by TTL set during Save, so no extra work.
}
