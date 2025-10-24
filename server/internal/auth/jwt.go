package auth

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"bafachat/internal/models"

	"github.com/golang-jwt/jwt/v5"
)

// Claims represents the JWT payload containing essential user information.
type Claims struct {
	UserID   uint   `json:"user_id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

var (
	jwtConfigOnce sync.Once
	jwtSecret     []byte
	jwtDuration   time.Duration
	jwtConfigErr  error
)

func loadJWTConfig() {
	secret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if secret == "" {
		jwtConfigErr = errors.New("JWT_SECRET is not configured")
		return
	}

	durationStr := strings.TrimSpace(os.Getenv("JWT_EXPIRES_IN"))
	if durationStr == "" {
		durationStr = "24h"
	}

	dur, err := time.ParseDuration(durationStr)
	if err != nil {
		jwtConfigErr = fmt.Errorf("invalid JWT_EXPIRES_IN value: %w", err)
		return
	}

	jwtSecret = []byte(secret)
	jwtDuration = dur
}

func ensureJWTConfig() error {
	jwtConfigOnce.Do(loadJWTConfig)
	return jwtConfigErr
}

// GenerateJWT builds a signed JWT for the provided user.
func GenerateJWT(user models.User) (string, time.Time, error) {
	if err := ensureJWTConfig(); err != nil {
		return "", time.Time{}, err
	}

	expiresAt := time.Now().Add(jwtDuration)

	claims := Claims{
		UserID:   user.ID,
		Email:    user.Email,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatUint(uint64(user.ID), 10),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", time.Time{}, err
	}

	return signed, expiresAt, nil
}

// ParseJWT validates and parses a signed JWT string.
func ParseJWT(tokenString string) (*Claims, error) {
	if err := ensureJWTConfig(); err != nil {
		return nil, err
	}

	parsedToken, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := parsedToken.Claims.(*Claims)
	if !ok || !parsedToken.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}
