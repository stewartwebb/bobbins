package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// GenerateRandomToken returns a URL-safe random token composed of n bytes.
func GenerateRandomToken(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("invalid token size: %d", n)
	}

	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(buf), nil
}
