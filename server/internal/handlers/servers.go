package handlers

import (
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/mail"
	"os"
	"strconv"
	"strings"
	"time"

	"bafachat/internal/auth"
	"bafachat/internal/email"
	"bafachat/internal/models"
	"bafachat/internal/queue"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

const (
	defaultInviteExpiryHours   = 168
	inviteCodeBytes            = 12
	maxInviteEmailsPerRequest  = 10
)

var (
	errServerMembershipRequired = errors.New("user is not a member of this server")
	errServerOwnerRequired      = errors.New("only server owners can perform this action")
)

// GetServers returns all servers for the current user.
func GetServers(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var servers []models.Server
	err := db.WithContext(c).
		Select("servers.*, server_members.role AS current_member_role").
		Joins("JOIN server_members ON server_members.server_id = servers.id AND server_members.user_id = ?", claims.UserID).
		Preload("Owner").
		Find(&servers).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load servers"})
		return
	}

	payload := make([]gin.H, 0, len(servers))
	for _, server := range servers {
		payload = append(payload, serializeServer(server))
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"servers": payload}})
}

// CreateServer creates a new server with a default channel and invite.
func CreateServer(c *gin.Context) {
	var req models.CreateServerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server name is required"})
		return
	}

	description := strings.TrimSpace(req.Description)
	icon := strings.TrimSpace(req.Icon)

	var server models.Server
	var invite models.ServerInvite

	err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		server = models.Server{
			Name:        name,
			Description: description,
			Icon:        icon,
			OwnerID:     claims.UserID,
		}

		if err := tx.Create(&server).Error; err != nil {
			return err
		}

		member := models.ServerMember{
			ServerID: server.ID,
			UserID:   claims.UserID,
			Role:     models.ServerRoleOwner,
		}

		if err := tx.Create(&member).Error; err != nil {
			return err
		}

		defaultChannel := models.Channel{
			Name:        "general",
			Description: "General discussion",
			Type:        "text",
			ServerID:    server.ID,
			Position:    0,
		}

		if err := tx.Create(&defaultChannel).Error; err != nil {
			return err
		}

		expiresAt := time.Now().Add(defaultInviteExpiryHours * time.Hour)
		newInvite, err := createServerInvite(tx, server.ID, claims.UserID, &expiresAt, 0)
		if err != nil {
			return err
		}

		invite = newInvite

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create server"})
		return
	}

	if err := db.WithContext(c).Preload("Owner").First(&server, server.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	server.CurrentMemberRole = models.ServerRoleOwner

	c.JSON(http.StatusCreated, gin.H{
		"message": "Server created",
		"data": gin.H{
			"server":         serializeServer(server),
			"default_invite": serializeInvite(invite),
		},
	})
}

// CreateServerInvite generates a new invite link and optionally emails it to recipients.
func CreateServerInvite(c *gin.Context) {
	serverIDParam := c.Param("serverID")
	serverIDValue, err := strconv.ParseUint(serverIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server id"})
		return
	}

	var req models.CreateServerInviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).First(&server, uint(serverIDValue)).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	if err := requireServerOwner(db.WithContext(c), server.ID, claims.UserID); err != nil {
		switch err {
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
			return
		case errServerOwnerRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
			return
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify permissions"})
			return
		}
	}

	maxUses := req.MaxUses
	if maxUses < 0 {
		maxUses = 0
	}

	var expiresAt *time.Time
	if req.ExpiresInHours > 0 {
		exp := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)
		expiresAt = &exp
	}

	var invite models.ServerInvite
	err = db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		createdInvite, err := createServerInvite(tx, server.ID, claims.UserID, expiresAt, maxUses)
		if err != nil {
			return err
		}

		invite = createdInvite
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create invite"})
		return
	}

	emails := normalizeEmails(req.Emails)
	if len(emails) > 0 {
		sendServerInviteEmails(c, server, invite, emails, claims.Username, strings.TrimSpace(req.Message))
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Invite created",
		"data": gin.H{
			"invite": serializeInvite(invite),
		},
	})
}

// GetServer returns a specific server by ID for the current user.
func GetServer(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	serverIDParam := c.Param("serverID")
	serverIDValue, err := strconv.ParseUint(serverIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server id"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).
		Preload("Owner").
		Where("id = ?", uint(serverIDValue)).
		First(&server).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	var membership models.ServerMember
	if err := db.WithContext(c).
		Where("server_id = ? AND user_id = ?", server.ID, claims.UserID).
		First(&membership).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
		return
	}

	server.CurrentMemberRole = membership.Role

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"server": serializeServer(server)}})
}

// GetServerChannelParticipants returns active WebRTC participants for all channels in a server.
func GetServerChannelParticipants(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	hub, ok := getWebSocketHub(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "websocket hub unavailable"})
		return
	}

	serverIDParam := c.Param("serverID")
	serverIDValue, err := strconv.ParseUint(serverIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid server id"})
		return
	}

	if err := ensureServerMembership(db.WithContext(c), uint(serverIDValue), claims.UserID); err != nil {
		switch err {
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
		}
		return
	}

	var channels []models.Channel
	if err := db.WithContext(c).
		Where("server_id = ? AND type = ?", uint(serverIDValue), models.ChannelTypeAudio).
		Find(&channels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channels"})
		return
	}

	result := make(map[string]interface{})
	for _, channel := range channels {
		participants := hub.WebRTCParticipants(channel.ID)
		if len(participants) > 0 {
			serializedParticipants := make([]map[string]interface{}, 0, len(participants))
			
			userIDs := make([]uint, 0, len(participants))
			for _, p := range participants {
				userIDs = append(userIDs, p.UserID)
			}

			var users []models.User
			if len(userIDs) > 0 {
				if err := db.WithContext(c).
					Select("id", "username", "avatar").
					Where("id IN ?", userIDs).
					Find(&users).Error; err != nil {
					continue
				}
			}

			userMap := make(map[uint]models.User)
			for _, user := range users {
				userMap[user.ID] = user
			}

			for _, participant := range participants {
				user, ok := userMap[participant.UserID]
				serialized := map[string]interface{}{
					"user_id":      participant.UserID,
					"display_name": participant.DisplayName,
					"role":         participant.Role,
					"session_id":   participant.SessionID,
					"media_state":  participant.MediaState,
					"channel_id":   participant.ChannelID,
					"last_seen":    participant.LastSeen.Format(time.RFC3339),
					"username":     "",
					"avatar":       "",
				}
				if ok {
					serialized["username"] = user.Username
					serialized["avatar"] = user.Avatar
				}
				serializedParticipants = append(serializedParticipants, serialized)
			}

			result[strconv.Itoa(int(channel.ID))] = serializedParticipants
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

func requireServerOwner(db *gorm.DB, serverID, userID uint) error {
	var membership models.ServerMember
	if err := db.Where("server_id = ? AND user_id = ?", serverID, userID).First(&membership).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errServerMembershipRequired
		}
		return err
	}

	if membership.Role != models.ServerRoleOwner {
		return errServerOwnerRequired
	}

	return nil
}

func ensureServerMembership(db *gorm.DB, serverID, userID uint) error {
	var membership models.ServerMember
	if err := db.Where("server_id = ? AND user_id = ?", serverID, userID).First(&membership).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errServerMembershipRequired
		}
		return err
	}

	return nil
}

func createServerInvite(tx *gorm.DB, serverID, inviterID uint, expiresAt *time.Time, maxUses int) (models.ServerInvite, error) {
	maxAttempts := 5
	for attempts := 0; attempts < maxAttempts; attempts++ {
		code, err := generateInviteCode(inviteCodeBytes)
		if err != nil {
			return models.ServerInvite{}, err
		}

		invite := models.ServerInvite{
			Code:      code,
			ServerID:  serverID,
			InviterID: inviterID,
			MaxUses:   maxUses,
			ExpiresAt: expiresAt,
		}

		if err := tx.Create(&invite).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				continue
			}
			return models.ServerInvite{}, err
		}

		return invite, nil
	}

	return models.ServerInvite{}, fmt.Errorf("failed to generate unique invite code")
}

func generateInviteCode(bytes int) (string, error) {
	if bytes <= 0 {
		bytes = inviteCodeBytes
	}

	code, err := auth.GenerateRandomToken(bytes)
	if err != nil {
		return "", err
	}

	// Remove any padding that might sneak in, keeping URL-safe characters only.
	return strings.TrimRight(code, "="), nil
}

func normalizeEmails(inputs []string) []string {
	if len(inputs) == 0 {
		return nil
	}

	unique := make(map[string]struct{})
	var cleaned []string

	for _, raw := range inputs {
		if len(cleaned) >= maxInviteEmailsPerRequest {
			break
		}

		addr := strings.TrimSpace(raw)
		if addr == "" {
			continue
		}

		parsed, err := mail.ParseAddress(addr)
		if err != nil {
			continue
		}

		email := strings.ToLower(parsed.Address)
		if _, exists := unique[email]; exists {
			continue
		}

		unique[email] = struct{}{}
		cleaned = append(cleaned, email)
	}

	return cleaned
}

func sendServerInviteEmails(c *gin.Context, server models.Server, invite models.ServerInvite, emails []string, inviterName, customMessage string) {
	queueClient, hasQueue := getQueueClient(c)
	emailService, hasEmail := getEmailService(c)
	if !hasQueue && !hasEmail {
		return
	}

	inviteURL := buildInviteURL(invite.Code)

	subject := fmt.Sprintf("You're invited to %s on BafaChat", server.Name)
	if strings.TrimSpace(inviterName) != "" {
		subject = fmt.Sprintf("%s invited you to %s on BafaChat", inviterName, server.Name)
	}

	var intro string
	if strings.TrimSpace(inviterName) != "" {
		intro = fmt.Sprintf("%s invited you to join the %s workspace on BafaChat.", inviterName, server.Name)
	} else {
		intro = fmt.Sprintf("You've been invited to join the %s workspace on BafaChat.", server.Name)
	}

	if customMessage != "" {
		customMessage = strings.TrimSpace(customMessage)
	}

	htmlBody := fmt.Sprintf(`<p>%s</p>%s<p><a href="%s" style="background-color:#38bdf8;border-radius:8px;color:#0f172a;padding:10px 16px;text-decoration:none;font-weight:600;">Accept invite</a></p><p>If the button doesn't work, copy and paste this link into your browser:</p><p>%s</p><p>— The BafaChat Team</p>`,
		intro,
		formatOptionalHTMLMessage(customMessage),
		inviteURL,
		inviteURL,
	)

	textBody := fmt.Sprintf("%s\n\nAccept your invite: %s\n\n— The BafaChat Team", intro, inviteURL)
	if customMessage != "" {
		textBody = fmt.Sprintf("%s\n\n%s\n\nAccept your invite: %s\n\n— The BafaChat Team", intro, customMessage, inviteURL)
	}

	payload := queue.EmailTaskPayload{
		To:       strings.Join(emails, ","),
		Subject:  subject,
		HTMLBody: htmlBody,
		TextBody: textBody,
		Tag:      "server-invite",
		Meta: map[string]string{
			"server_id": fmt.Sprintf("%d", server.ID),
			"invite_id": fmt.Sprintf("%d", invite.ID),
		},
	}

	ctx := c.Request.Context()

	if hasQueue {
		for _, emailAddr := range emails {
			payload.To = emailAddr
			task, err := queue.NewEmailTask(payload)
			if err != nil {
				continue
			}
			if _, err := queueClient.Enqueue(task, asynq.MaxRetry(3)); err != nil {
				continue
			}
		}
		return
	}

	if hasEmail {
		for _, emailAddr := range emails {
			payload.To = emailAddr
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
}

func formatOptionalHTMLMessage(message string) string {
	if message == "" {
		return ""
	}

	escaped := template.HTMLEscapeString(message)
	return fmt.Sprintf("<p>%s</p>", strings.ReplaceAll(escaped, "\n", "<br/>"))
}

func buildInviteURL(code string) string {
	baseURL := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if baseURL == "" {
		baseURL = defaultAppBaseURL
	}

	return fmt.Sprintf("%s/invite/%s", strings.TrimRight(baseURL, "/"), code)
}

func serializeServer(server models.Server) gin.H {
	var owner gin.H
	if server.Owner.ID != 0 {
		owner = gin.H{
			"id":       server.Owner.ID,
			"username": server.Owner.Username,
			"email":    server.Owner.Email,
		}
	}

	return gin.H{
		"id":          server.ID,
		"name":        server.Name,
		"description": server.Description,
		"icon":        server.Icon,
		"owner_id":    server.OwnerID,
		"owner":       owner,
		"current_member_role": server.CurrentMemberRole,
		"created_at":  server.CreatedAt.Format(time.RFC3339),
		"updated_at":  server.UpdatedAt.Format(time.RFC3339),
	}
}

func serializeInvite(invite models.ServerInvite) gin.H {
	var expiresAt string
	if invite.ExpiresAt != nil {
		expiresAt = invite.ExpiresAt.Format(time.RFC3339)
	}

	return gin.H{
		"id":          invite.ID,
		"code":        invite.Code,
		"server_id":   invite.ServerID,
		"inviter_id":  invite.InviterID,
		"max_uses":    invite.MaxUses,
		"uses":        invite.Uses,
		"expires_at":  expiresAt,
		"invite_url":  buildInviteURL(invite.Code),
		"created_at":  invite.CreatedAt.Format(time.RFC3339),
		"updated_at":  invite.UpdatedAt.Format(time.RFC3339),
	}
}
