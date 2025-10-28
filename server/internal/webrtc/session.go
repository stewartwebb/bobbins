package webrtc

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

// SessionToken encapsulates a short-lived token used to authenticate
// a WebRTC signaling session over the websocket transport.
type SessionToken struct {
	Token       string
	ChannelID   uint
	UserID      uint
	DisplayName string
	Role        string
	SessionID   string
	ExpiresAt   time.Time
}

// TokenStore abstracts storage for session tokens so the manager can be backed
// by local memory or a shared datastore (e.g. Redis) when the application is
// running across multiple instances.
type TokenStore interface {
	Save(SessionToken) error
	Get(token string) (SessionToken, error)
	Delete(token string) error
	Cleanup(now time.Time)
}

// memoryTokenStore implements TokenStore using an in-memory map. This mirrors
// the previous behaviour and remains the default when no shared store is
// configured.
type memoryTokenStore struct {
	mu     sync.RWMutex
	tokens map[string]SessionToken
}

func newMemoryTokenStore() *memoryTokenStore {
	return &memoryTokenStore{
		tokens: make(map[string]SessionToken),
	}
}

func (s *memoryTokenStore) Save(session SessionToken) error {
	s.mu.Lock()
	s.tokens[session.Token] = session
	s.mu.Unlock()
	return nil
}

func (s *memoryTokenStore) Get(token string) (SessionToken, error) {
	s.mu.RLock()
	session, ok := s.tokens[token]
	s.mu.RUnlock()
	if !ok {
		return SessionToken{}, ErrTokenNotFound
	}
	return session, nil
}

func (s *memoryTokenStore) Delete(token string) error {
	s.mu.Lock()
	delete(s.tokens, token)
	s.mu.Unlock()
	return nil
}

func (s *memoryTokenStore) Cleanup(now time.Time) {
	s.mu.Lock()
	for key, session := range s.tokens {
		if now.After(session.ExpiresAt) {
			delete(s.tokens, key)
		}
	}
	s.mu.Unlock()
}

// Manager issues, validates, and revokes signaling session tokens.
type Manager struct {
	store TokenStore
	ttl   time.Duration
}

var (
	// ErrTokenNotFound is returned when a session token does not exist.
	ErrTokenNotFound = errors.New("webrtc session token not found")
	// ErrTokenExpired signals a token has expired.
	ErrTokenExpired = errors.New("webrtc session token expired")
	// ErrTokenMismatch signals the token exists but is not valid for the
	// provided user/channel pair (user or channel mismatch).
	ErrTokenMismatch = errors.New("webrtc session token mismatch")
)

// NewManager constructs a Manager with the provided TTL for issued tokens
// backed by the default in-memory store.
func NewManager(ttl time.Duration) *Manager {
	return NewManagerWithStore(ttl, nil)
}

// NewManagerWithStore constructs a Manager with the provided TTL and custom
// TokenStore. When store is nil the default in-memory store is used.
func NewManagerWithStore(ttl time.Duration, store TokenStore) *Manager {
	if ttl <= 0 {
		ttl = 2 * time.Minute
	}
	if store == nil {
		store = newMemoryTokenStore()
	}
	return &Manager{
		store: store,
		ttl:   ttl,
	}
}

// Issue creates and stores a new session token for the given user/channel pair.
func (m *Manager) Issue(userID, channelID uint, displayName, role string) (SessionToken, error) {
	token, err := generateToken(24)
	if err != nil {
		return SessionToken{}, err
	}

	sessionID, err := generateToken(12)
	if err != nil {
		return SessionToken{}, err
	}

	session := SessionToken{
		Token:       token,
		ChannelID:   channelID,
		UserID:      userID,
		DisplayName: displayName,
		Role:        role,
		SessionID:   sessionID,
		ExpiresAt:   time.Now().Add(m.ttl),
	}

	if err := m.store.Save(session); err != nil {
		return SessionToken{}, err
	}

	return session, nil
}

// Validate verifies the token exists, has not expired, and matches the expected channel/user.
func (m *Manager) Validate(token string, expectedUserID, expectedChannelID uint) (SessionToken, error) {
	session, err := m.store.Get(token)
	if err != nil {
		return SessionToken{}, err
	}

	if time.Now().After(session.ExpiresAt) {
		_ = m.store.Delete(token)
		return SessionToken{}, ErrTokenExpired
	}

	if session.UserID != expectedUserID || session.ChannelID != expectedChannelID {
		return SessionToken{}, ErrTokenMismatch
	}

	return session, nil
}

// Revoke removes a session token.
func (m *Manager) Revoke(token string) {
	_ = m.store.Delete(token)
}

// Cleanup removes expired tokens. Intended to be called periodically.
func (m *Manager) Cleanup() {
	m.store.Cleanup(time.Now())
}

func generateToken(length int) (string, error) {
	if length <= 0 {
		length = 24
	}

	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(buf), nil
}
