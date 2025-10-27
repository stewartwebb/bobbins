package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"bafachat/internal/auth"
	"bafachat/internal/email"
	"bafachat/internal/models"
	"bafachat/internal/queue"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

const defaultAppBaseURL = "http://localhost:3000"

// Register handles user registration including email verification flow.
func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	username := strings.TrimSpace(req.Username)
	emailAddr := strings.ToLower(strings.TrimSpace(req.Email))
	password := strings.TrimSpace(req.Password)

	if err := ensureUniqueUser(db, username, emailAddr); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, errUserConflict) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := auth.HashPassword(password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid password"})
		return
	}

	verificationToken, err := auth.GenerateRandomToken(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate verification token"})
		return
	}

	now := time.Now()
	user := models.User{
		Username:                username,
		Email:                   emailAddr,
		Password:                hashedPassword,
		EmailVerificationToken:  verificationToken,
		EmailVerificationSentAt: &now,
	}

	if err := db.WithContext(c).Create(&user).Error; err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": errUserConflict.Error()})
			return
		}

		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	sendVerificationEmail(c, &user)

	c.JSON(http.StatusCreated, gin.H{
		"message": "Registration successful. Check your email to verify your account.",
		"data": gin.H{
			"user": serializeUser(user),
		},
	})
}

// Login handles user authentication by validating credentials and email verification state.
func Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	password := strings.TrimSpace(req.Password)

	var user models.User
	// Check if identifier contains @ to determine if it's an email or username
	if strings.Contains(identifier, "@") {
		emailAddr := strings.ToLower(identifier)
		if err := db.WithContext(c).Where("email = ?", emailAddr).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query user"})
			return
		}
	} else {
		if err := db.WithContext(c).Where("LOWER(username) = ?", strings.ToLower(identifier)).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to query user"})
			return
		}
	}

	if err := auth.ComparePassword(user.Password, password); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.EmailVerifiedAt == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "email verification required"})
		return
	}

	token, expiresAt, err := auth.GenerateJWT(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate auth token"})
		return
	}

	if err := touchLastLogin(db, c, &user); err != nil {
		// Non-blocking: log and continue serving response.
		c.Error(err) // Logged by gin
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"data": gin.H{
			"token":      token,
			"expires_at": expiresAt.Format(time.RFC3339),
			"user":       serializeUser(user),
		},
	})
}

// VerifyEmail confirms a user's email using the provided verification token.
func VerifyEmail(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "verification token is required"})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	var user models.User
	if err := db.WithContext(c).Where("email_verification_token = ?", token).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired verification token"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify email"})
		return
	}

	now := time.Now()
	updates := map[string]any{
		"email_verified_at":        now,
		"email_verification_token": "",
	}

	if err := db.WithContext(c).Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update verification status"})
		return
	}

	user.EmailVerifiedAt = &now
	user.EmailVerificationToken = ""

	c.JSON(http.StatusOK, gin.H{
		"message": "Email verified successfully",
		"data": gin.H{
			"user": serializeUser(user),
		},
	})
}

// Logout handles user logout.
func Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "User logged out successfully",
	})
}

// GetCurrentUser returns the current authenticated user based on JWT claims.
func GetCurrentUser(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claimsValue, exists := c.Get("userClaims")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	claims, ok := claimsValue.(*auth.Claims)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authentication state"})
		return
	}

	var user models.User
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"user": serializeUser(user)}})
}

// UpdateCurrentUser updates the current user's profile placeholder.
func UpdateCurrentUser(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "update profile not implemented"})
}

var errUserConflict = errors.New("username or email already in use")

func ensureUniqueUser(db *gorm.DB, username, email string) error {
	var count int64
	if err := db.Model(&models.User{}).
		Where("LOWER(username) = ? OR LOWER(email) = ?", strings.ToLower(username), strings.ToLower(email)).
		Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		return errUserConflict
	}

	return nil
}

func touchLastLogin(db *gorm.DB, c *gin.Context, user *models.User) error {
	now := time.Now()
	if err := db.WithContext(c).Model(user).Update("last_login_at", now).Error; err != nil {
		return fmt.Errorf("failed to update last login: %w", err)
	}

	user.LastLoginAt = &now
	return nil
}

func serializeUser(user models.User) gin.H {
	var emailVerifiedAt string
	if user.EmailVerifiedAt != nil {
		emailVerifiedAt = user.EmailVerifiedAt.Format(time.RFC3339)
	}

	var lastLogin string
	if user.LastLoginAt != nil {
		lastLogin = user.LastLoginAt.Format(time.RFC3339)
	}

	return gin.H{
		"id":                user.ID,
		"username":          user.Username,
		"email":             user.Email,
		"avatar":            user.Avatar,
		"email_verified_at": emailVerifiedAt,
		"last_login_at":     lastLogin,
		"created_at":        user.CreatedAt.Format(time.RFC3339),
		"updated_at":        user.UpdatedAt.Format(time.RFC3339),
	}
}

func sendVerificationEmail(c *gin.Context, user *models.User) {
	queueClient, hasQueue := getQueueClient(c)
	emailService, hasEmail := getEmailService(c)
	if !hasQueue && !hasEmail {
		return
	}

	baseURL := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAppBaseURL
	}

	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", strings.TrimRight(baseURL, "/"), user.EmailVerificationToken)
	subject := "Verify your BafaChat account"
	htmlBody := fmt.Sprintf(`<p>Hi %s,</p><p>Thanks for joining BafaChat! Confirm your email by clicking the button below:</p><p><a href="%s" style="background-color:#38bdf8;border-radius:8px;color:#0f172a;padding:10px 16px;text-decoration:none;font-weight:600;">Verify Email</a></p><p>If the button doesn't work, copy and paste this link into your browser:</p><p>%s</p><p>— The BafaChat Team</p>`, user.Username, verifyURL, verifyURL)
	textBody := fmt.Sprintf("Hi %s,\n\nThanks for joining BafaChat! Confirm your email by visiting the link below:\n%s\n\n— The BafaChat Team", user.Username, verifyURL)

	payload := queue.EmailTaskPayload{
		To:       user.Email,
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
		Tag:      "auth-email-verification",
		Meta: map[string]string{
			"user_id": fmt.Sprintf("%d", user.ID),
		},
	}

	ctx := c.Request.Context()

	if hasQueue {
		task, err := queue.NewEmailTask(payload)
		if err == nil {
			if _, enqueueErr := queueClient.Enqueue(task, asynq.MaxRetry(5)); enqueueErr == nil {
				return
			}
		}
	}

	if hasEmail {
		_ = emailService.SendEmail(ctx, email.SendEmailInput{
			To:       payload.To,
			Subject:  payload.Subject,
			HTMLBody: payload.HTMLBody,
			TextBody: payload.TextBody,
			Tag:      payload.Tag,
			Metadata: payload.Meta,
		})
	}
}
