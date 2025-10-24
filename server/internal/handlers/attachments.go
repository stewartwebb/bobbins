package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"bafachat/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type presignAttachmentRequest struct {
	FileName    string `json:"file_name" binding:"required"`
	ContentType string `json:"content_type"`
	FileSize    int64  `json:"file_size" binding:"required"`
}

// CreateAttachmentUpload issues a pre-signed upload URL for the caller to upload an attachment directly to object storage.
func CreateAttachmentUpload(c *gin.Context) {
	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
		return
	}

	channelIDParam := c.Param("id")
	channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
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

	var channel models.Channel
	if err := db.WithContext(c).First(&channel, channelIDValue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if channel.Type != models.ChannelTypeText {
		c.JSON(http.StatusBadRequest, gin.H{"error": "attachments are only supported in text channels"})
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

	var req presignAttachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.FileName = strings.TrimSpace(req.FileName)
	if req.FileName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_name is required"})
		return
	}

	if req.FileSize <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file_size must be greater than 0"})
		return
	}

	signature, err := storageService.PresignUpload(c.Request.Context(), req.FileName, req.ContentType, req.FileSize)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"upload_url": signature.UploadURL,
			"method":     signature.Method,
			"headers":    signature.Headers,
			"object_key": signature.ObjectKey,
			"file_url":   signature.FileURL,
			"expires_at": signature.ExpiresAt.Format(time.RFC3339),
		},
	})
}

// UploadAttachmentMessage uploads a file via the backend and creates a message with the stored attachment.
func UploadAttachmentMessage(c *gin.Context) {
	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
		return
	}

	channelIDParam := c.Param("id")
	channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
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

	var channel models.Channel
	if err := db.WithContext(c).First(&channel, channelIDValue).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load channel"})
		return
	}

	if channel.Type != models.ChannelTypeText {
		c.JSON(http.StatusBadRequest, gin.H{"error": "attachments are only supported in text channels"})
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

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}

	if fileHeader.Size <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file must be greater than 0 bytes"})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
		return
	}
	defer file.Close()

	contentType := fileHeader.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	uploadResult, err := storageService.UploadObject(c.Request.Context(), fileHeader.Filename, contentType, fileHeader.Size, file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	attachments := []models.MessageAttachment{
		{
			ObjectKey:   uploadResult.ObjectKey,
			URL:         uploadResult.FileURL,
			FileName:    fileHeader.Filename,
			ContentType: contentType,
			FileSize:    fileHeader.Size,
		},
	}

	content := strings.TrimSpace(c.PostForm("content"))
	messageType := models.MessageTypeFile
	if content != "" {
		messageType = models.MessageTypeFile
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

		for i := range attachments {
			attachments[i].MessageID = message.ID
		}

		if err := tx.Create(&attachments).Error; err != nil {
			return err
		}

		if err := tx.Preload("User").Preload("Attachments").First(&createdMessage, message.ID).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create message"})
		return
	}

	serialized := serializeMessage(createdMessage)

	if len(createdMessage.Attachments) > 0 {
		createdMessage.Attachments = generateAttachmentPreviews(c.Request.Context(), db, storageService, createdMessage.Attachments)
		serialized = serializeMessage(createdMessage)
	}

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
