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

// Manager issues, validates, and revokes signaling session tokens.
type Manager struct {
    mu     sync.RWMutex
    tokens map[string]SessionToken
    ttl    time.Duration
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

// NewManager constructs a Manager with the provided TTL for issued tokens.
func NewManager(ttl time.Duration) *Manager {
    if ttl <= 0 {
        ttl = 2 * time.Minute
    }
    return &Manager{
        tokens: make(map[string]SessionToken),
        ttl:    ttl,
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

    m.mu.Lock()
    m.tokens[token] = session
    m.mu.Unlock()

    return session, nil
}

// Validate verifies the token exists, has not expired, and matches the expected channel/user.
func (m *Manager) Validate(token string, expectedUserID, expectedChannelID uint) (SessionToken, error) {
    m.mu.RLock()
    session, ok := m.tokens[token]
    m.mu.RUnlock()
    if !ok {
        return SessionToken{}, ErrTokenNotFound
    }

    if time.Now().After(session.ExpiresAt) {
        m.mu.Lock()
        delete(m.tokens, token)
        m.mu.Unlock()
        return SessionToken{}, ErrTokenExpired
    }

    if session.UserID != expectedUserID || session.ChannelID != expectedChannelID {
        return SessionToken{}, ErrTokenMismatch
    }

    return session, nil
}

// Revoke removes a session token.
func (m *Manager) Revoke(token string) {
    m.mu.Lock()
    delete(m.tokens, token)
    m.mu.Unlock()
}

// Cleanup removes expired tokens. Intended to be called periodically.
func (m *Manager) Cleanup() {
    now := time.Now()
    m.mu.Lock()
    for key, session := range m.tokens {
        if now.After(session.ExpiresAt) {
            delete(m.tokens, key)
        }
    }
    m.mu.Unlock()
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
