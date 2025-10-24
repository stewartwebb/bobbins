package handlers

import (
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"bafachat/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	defaultChannelPageSize = 50
	maxChannelPageSize     = 200
)

// GetChannels returns all channels for a specific server
func GetChannels(c *gin.Context) {
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
		Where("server_id = ?", uint(serverIDValue)).
		Order("position ASC, created_at ASC").
		Find(&channels).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channels"})
		return
	}

	response := make([]gin.H, 0, len(channels))
	for _, channel := range channels {
		response = append(response, serializeChannel(channel))
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"channels": response}})
}

// CreateChannel creates a new channel in a server
func CreateChannel(c *gin.Context) {
	var req models.CreateChannelRequest
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

	if req.ServerID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server id is required"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).First(&server, req.ServerID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	if err := requireServerOwner(db.WithContext(c), server.ID, claims.UserID); err != nil {
		switch err {
		case errServerOwnerRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "only server owners can create channels"})
			return
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
			return
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to validate permissions"})
			return
		}
	}

	channelType := normalizeChannelType(req.Type)
	if channelType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel type must be text or audio"})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel name is required"})
		return
	}

	description := strings.TrimSpace(req.Description)
	position := req.Position
	if position <= 0 {
		var maxPosition sql.NullInt64
		if err := db.WithContext(c).
			Model(&models.Channel{}).
			Where("server_id = ?", server.ID).
			Select("MAX(position)").
			Scan(&maxPosition).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to determine channel position"})
			return
		}

		if maxPosition.Valid {
			position = int(maxPosition.Int64) + 1
		} else {
			position = 0
		}
	}

	channel := models.Channel{
		Name:        name,
		Description: description,
		Type:        channelType,
		ServerID:    server.ID,
		Position:    position,
	}

	if err := db.WithContext(c).Create(&channel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create channel"})
		return
	}

	if err := db.WithContext(c).First(&channel, channel.ID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if hub, ok := getWebSocketHub(c); ok {
		_ = hub.Publish(gin.H{
			"type": "channel.created",
			"data": gin.H{
				"channel":   serializeChannel(channel),
				"server_id": server.ID,
			},
		})
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Channel created",
		"data": gin.H{
			"channel": serializeChannel(channel),
		},
	})
}

// GetMessages returns messages for a specific channel
func GetMessages(c *gin.Context) {
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

	channelIDParam := c.Param("id")
	channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}

	var channel models.Channel
	if err := db.WithContext(c).First(&channel, channelIDValue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if err := ensureServerMembership(db.WithContext(c), channel.ServerID, claims.UserID); err != nil {
		switch err {
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
			return
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
			return
		}
	}

	limit := defaultChannelPageSize
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		if parsedLimit, err := strconv.Atoi(rawLimit); err == nil {
			if parsedLimit < 1 {
				parsedLimit = 1
			}
			if parsedLimit > maxChannelPageSize {
				parsedLimit = maxChannelPageSize
			}
			limit = parsedLimit
		}
	}

	var messages []models.Message
	beforeCursor := strings.TrimSpace(c.Query("before"))
	var beforeTime time.Time
	beforeProvided := false
	if beforeCursor != "" {
		parsed, err := time.Parse(time.RFC3339, beforeCursor)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid before cursor"})
			return
		}
		beforeTime = parsed.UTC()
		beforeProvided = true
	}

	query := db.WithContext(c).
		Preload("User").
		Preload("Attachments").
		Where("channel_id = ?", channel.ID)

	if beforeProvided {
		query = query.Where("created_at < ?", beforeTime)
	}

	fetchLimit := limit + 1

	if err := query.
		Order("created_at DESC, id DESC").
		Limit(fetchLimit).
		Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load messages"})
		return
	}

	hasMore := false
	if len(messages) > limit {
		hasMore = true
		messages = messages[:limit]
	}

	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	response := make([]gin.H, 0, len(messages))
	for _, message := range messages {
		response = append(response, serializeMessage(message))
	}

	payload := gin.H{
		"messages": response,
		"has_more": hasMore,
	}

	if len(messages) > 0 {
		payload["next_cursor"] = messages[0].CreatedAt.UTC().Format(time.RFC3339)
	}

	c.JSON(http.StatusOK, gin.H{"data": payload})
}

// CreateMessage creates a text message inside a channel
func CreateMessage(c *gin.Context) {
	var req models.CreateMessageRequest
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

	channelIDParam := c.Param("id")
	channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}

	var channel models.Channel
	if err := db.WithContext(c).First(&channel, channelIDValue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if err := ensureServerMembership(db.WithContext(c), channel.ServerID, claims.UserID); err != nil {
		switch err {
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
			return
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
			return
		}
	}

	if channel.Type != models.ChannelTypeText {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages can only be created in text channels"})
		return
	}

	storageService, hasStorage := getStorageService(c)

	content := strings.TrimSpace(req.Content)
	hasAttachments := len(req.Attachments) > 0

	messageType := strings.ToLower(strings.TrimSpace(req.Type))
	if messageType == "" {
		if hasAttachments {
			messageType = models.MessageTypeFile
		} else {
			messageType = models.MessageTypeText
		}
	}

	switch messageType {
	case models.MessageTypeText:
		if content == "" && !hasAttachments {
			c.JSON(http.StatusBadRequest, gin.H{"error": "message content is required"})
			return
		}
	case models.MessageTypeFile:
		if !hasAttachments {
			c.JSON(http.StatusBadRequest, gin.H{"error": "attachments are required for file messages"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported message type"})
		return
	}

	attachments := make([]models.MessageAttachment, 0, len(req.Attachments))
	if hasAttachments {
		for _, attachment := range req.Attachments {
			objectKey := strings.TrimSpace(attachment.ObjectKey)
			if objectKey == "" || strings.Contains(objectKey, "..") {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment object key"})
				return
			}

			url := strings.TrimSpace(attachment.URL)
			if url == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "attachment url is required"})
				return
			}

			fileName := strings.TrimSpace(attachment.FileName)
			if fileName == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "attachment file name is required"})
				return
			}

			contentType := strings.TrimSpace(attachment.ContentType)
			if contentType == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "attachment content type is required"})
				return
			}

			if attachment.FileSize <= 0 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "attachment file size must be greater than zero"})
				return
			}

			attachments = append(attachments, models.MessageAttachment{
				ObjectKey:   objectKey,
				URL:         url,
				FileName:    fileName,
				ContentType: contentType,
				FileSize:    attachment.FileSize,
			})
		}
	}

	var createdMessage models.Message

	if err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		message := models.Message{
			Content:   content,
			UserID:    claims.UserID,
			ChannelID: channel.ID,
			Type:      messageType,
		}

		if err := tx.Create(&message).Error; err != nil {
			return err
		}

		if len(attachments) > 0 {
			for i := range attachments {
				attachments[i].MessageID = message.ID
			}
			if err := tx.Create(&attachments).Error; err != nil {
				return err
			}
		}

		if err := tx.Preload("User").Preload("Attachments").First(&createdMessage, message.ID).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create message"})
		return
	}

	if hasStorage && len(createdMessage.Attachments) > 0 {
		createdMessage.Attachments = generateAttachmentPreviews(c.Request.Context(), db, storageService, createdMessage.Attachments)
	}

	serialized := serializeMessage(createdMessage)
	c.JSON(http.StatusCreated, gin.H{
		"message": "Message created",
		"data": gin.H{
			"message": serialized,
		},
	})

	if hub, ok := getWebSocketHub(c); ok {
		_ = hub.Publish(gin.H{
			"type": "message.created",
			"data": gin.H{
				"message":    serialized,
				"channel_id": channel.ID,
				"server_id":  channel.ServerID,
			},
		})
	}
}

func normalizeChannelType(value string) string {
	typeValue := strings.ToLower(strings.TrimSpace(value))
	if typeValue == "" {
		return models.ChannelTypeText
	}

	switch typeValue {
	case models.ChannelTypeText:
		return models.ChannelTypeText
	case models.ChannelTypeAudio, "voice":
		return models.ChannelTypeAudio
	default:
		return ""
	}
}

func serializeChannel(channel models.Channel) gin.H {
	return gin.H{
		"id":          channel.ID,
		"name":        channel.Name,
		"description": channel.Description,
		"type":        channel.Type,
		"server_id":   channel.ServerID,
		"position":    channel.Position,
		"created_at":  channel.CreatedAt.Format(time.RFC3339),
		"updated_at":  channel.UpdatedAt.Format(time.RFC3339),
	}
}

func serializeMessage(message models.Message) gin.H {
	var author gin.H
	if message.User.ID != 0 {
		author = gin.H{
			"id":       message.User.ID,
			"username": message.User.Username,
			"email":    message.User.Email,
			"avatar":   message.User.Avatar,
		}
	}

	attachments := make([]gin.H, 0, len(message.Attachments))
	for _, attachment := range message.Attachments {
		attachments = append(attachments, serializeAttachment(attachment))
	}

	return gin.H{
		"id":          message.ID,
		"content":     message.Content,
		"type":        message.Type,
		"user_id":     message.UserID,
		"user":        author,
		"channel_id":  message.ChannelID,
		"attachments": attachments,
		"created_at":  message.CreatedAt.Format(time.RFC3339),
		"updated_at":  message.UpdatedAt.Format(time.RFC3339),
	}
}

// SendTypingIndicator broadcasts a typing signal for the current user within a channel.
func SendTypingIndicator(c *gin.Context) {
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

	channelIDParam := c.Param("id")
	channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
		return
	}

	var channel models.Channel
	if err := db.WithContext(c).First(&channel, channelIDValue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if err := ensureServerMembership(db.WithContext(c), channel.ServerID, claims.UserID); err != nil {
		switch err {
		case errServerMembershipRequired:
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
		}
		return
	}

	var user models.User
	if err := db.WithContext(c).
		Select("id", "username", "avatar").
		First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	var body struct {
		Active *bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&body); err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}

	active := true
	if body.Active != nil {
		active = *body.Active
	}

	expiry := time.Now()
	if active {
		expiry = expiry.Add(6 * time.Second)
	} else {
		expiry = expiry.Add(500 * time.Millisecond)
	}

	expiresAt := expiry.UTC().Format(time.RFC3339)

	if hub, ok := getWebSocketHub(c); ok {
		_ = hub.Publish(gin.H{
			"type": "channel.typing",
			"data": gin.H{
				"channel_id": channel.ID,
				"server_id":  channel.ServerID,
				"user": gin.H{
					"id":       user.ID,
					"username": user.Username,
					"avatar":   user.Avatar,
				},
				"active":     active,
				"expires_at": expiresAt,
			},
		})
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message": "typing indicator sent",
		"data": gin.H{
			"active":     active,
			"expires_at": expiresAt,
		},
	})
}

func serializeAttachment(attachment models.MessageAttachment) gin.H {
	return gin.H{
		"id":                 attachment.ID,
		"object_key":         attachment.ObjectKey,
		"url":                attachment.URL,
		"file_name":          attachment.FileName,
		"content_type":       attachment.ContentType,
		"file_size":          attachment.FileSize,
		"width":              attachment.Width,
		"height":             attachment.Height,
		"preview_url":        attachment.PreviewURL,
		"preview_object_key": attachment.PreviewObjectKey,
		"preview_width":      attachment.PreviewWidth,
		"preview_height":     attachment.PreviewHeight,
		"created_at":         attachment.CreatedAt.Format(time.RFC3339),
	}
}
