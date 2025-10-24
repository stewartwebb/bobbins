package auth

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

var errEmptyPassword = errors.New("password cannot be empty")

// HashPassword hashes the provided plaintext password using bcrypt.
func HashPassword(password string) (string, error) {
	if password == "" {
		return "", errEmptyPassword
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	return string(hashed), nil
}

// ComparePassword compares a bcrypt hashed password with its possible plaintext equivalent.
func ComparePassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}
