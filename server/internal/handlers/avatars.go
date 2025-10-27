package handlers

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"bafachat/internal/avatars"
	"bafachat/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PresignUserAvatarUpload generates a pre-signed upload URL for user avatar uploads.
func PresignUserAvatarUpload(c *gin.Context) {
	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
		return
	}

	_, ok = getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	var req presignAttachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !avatars.IsValidImageType(req.ContentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image type, must be jpeg, png, gif, or webp"})
		return
	}

	signature, err := storageService.PresignAvatarUpload(c.Request.Context(), req.FileName, req.ContentType, req.FileSize, "users")
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
			"expires_at": signature.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		},
	})
}

// SetUserAvatar sets the user's avatar by processing an uploaded image.
func SetUserAvatar(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	// Support two modes:
	// 1) JSON body with object_key (existing presign + set flow)
	// 2) multipart/form-data upload with field "file" and optional "crop_data" JSON string

	contentType := c.Request.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/") {
		// Direct upload path
		fileHeader, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
			return
		}

		if fileHeader.Size <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "file must be greater than 0 bytes"})
			return
		}

		f, err := fileHeader.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
			return
		}
		defer f.Close()

		// Read file into memory (avatars are expected to be small)
		buf, err := io.ReadAll(f)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read file"})
			return
		}

		detectedContentType := fileHeader.Header.Get("Content-Type")
		if detectedContentType == "" {
			detectedContentType = http.DetectContentType(buf)
		}

		if !avatars.IsValidImageType(detectedContentType) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image type"})
			return
		}

		// Parse optional crop_data
		var cropData *avatars.CropData
		cropJSON := c.PostForm("crop_data")
		if cropJSON != "" {
			var md models.AvatarCropData
			if err := json.Unmarshal([]byte(cropJSON), &md); err == nil {
				cropData = &avatars.CropData{
					X:      md.X,
					Y:      md.Y,
					Width:  md.Width,
					Height: md.Height,
					Scale:  md.Scale,
				}
			}
		}

		// Upload original file
		originalResult, err := storageService.UploadAvatarObject(
			c.Request.Context(),
			fileHeader.Filename,
			detectedContentType,
			int64(len(buf)),
			bytes.NewReader(buf),
			"users",
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload original avatar"})
			return
		}

		// Process and upload thumbnail
		processedBytes, processedContentType, err := avatars.ProcessAvatar(bytes.NewReader(buf), detectedContentType, cropData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to process avatar: %v", err)})
			return
		}

		thumbnailResult, err := storageService.UploadAvatarObject(
			c.Request.Context(),
			"avatar-thumbnail.jpg",
			processedContentType,
			int64(len(processedBytes)),
			bytes.NewReader(processedBytes),
			"users",
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload processed avatar"})
			return
		}

		// Serialize crop data for storage
		cropDataJSON := ""
		if cropData != nil {
			cropDataJSON, err = avatars.SerializeCropData(cropData)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save crop data"})
				return
			}
		}

		// Update user record
		var user models.User
		if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
			return
		}

		updates := map[string]interface{}{
			"avatar":              thumbnailResult.FileURL,
			"avatar_original_key": originalResult.ObjectKey,
			"avatar_crop_data":    cropDataJSON,
		}

		if err := db.WithContext(c).Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
			return
		}

		// Reload user to get updated values
		if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload user"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Avatar updated successfully",
			"data": gin.H{
				"user": serializeUser(user),
			},
		})
		return
	}

	// Fallback: existing presign-based flow (JSON body)
	var req models.SetAvatarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch the uploaded image from storage
	objectReader, _, contentType, err := storageService.GetObject(c.Request.Context(), req.ObjectKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to retrieve uploaded image"})
		return
	}
	defer objectReader.Close()

	if !avatars.IsValidImageType(contentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image type"})
		return
	}

	// Convert CropData from models to avatars package type
	var cropData *avatars.CropData
	if req.CropData != nil {
		cropData = &avatars.CropData{
			X:      req.CropData.X,
			Y:      req.CropData.Y,
			Width:  req.CropData.Width,
			Height: req.CropData.Height,
			Scale:  req.CropData.Scale,
		}
	}

	// Process the avatar (crop and resize)
	processedBytes, processedContentType, err := avatars.ProcessAvatar(objectReader, contentType, cropData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to process avatar: %v", err)})
		return
	}

	// Upload the processed thumbnail
	thumbnailReader := bytes.NewReader(processedBytes)
	thumbnailResult, err := storageService.UploadAvatarObject(
		c.Request.Context(),
		"avatar-thumbnail.jpg",
		processedContentType,
		int64(len(processedBytes)),
		thumbnailReader,
		"users",
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload processed avatar"})
		return
	}

	// Serialize crop data for storage
	cropDataJSON := ""
	if req.CropData != nil {
		cropDataJSON, err = avatars.SerializeCropData(cropData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save crop data"})
			return
		}
	}

	// Update user record
	var user models.User
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	updates := map[string]interface{}{
		"avatar":              thumbnailResult.FileURL,
		"avatar_original_key": req.ObjectKey,
		"avatar_crop_data":    cropDataJSON,
	}

	if err := db.WithContext(c).Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	// Reload user to get updated values
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Avatar updated successfully",
		"data": gin.H{
			"user": serializeUser(user),
		},
	})
}

// DeleteUserAvatar removes the user's avatar.
func DeleteUserAvatar(c *gin.Context) {
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

	var user models.User
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load user"})
		return
	}

	updates := map[string]interface{}{
		"avatar":              "",
		"avatar_original_key": "",
		"avatar_crop_data":    "",
	}

	if err := db.WithContext(c).Model(&user).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete avatar"})
		return
	}

	// Reload user to get updated values
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Avatar deleted successfully",
		"data": gin.H{
			"user": serializeUser(user),
		},
	})
}

// PresignServerAvatarUpload generates a pre-signed upload URL for server avatar uploads.
func PresignServerAvatarUpload(c *gin.Context) {
	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
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

	serverID := c.Param("serverID")
	if serverID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server ID is required"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).First(&server, serverID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	// Only server owner can update avatar
	if server.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only server owners can update the server avatar"})
		return
	}

	var req presignAttachmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !avatars.IsValidImageType(req.ContentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image type, must be jpeg, png, gif, or webp"})
		return
	}

	signature, err := storageService.PresignAvatarUpload(c.Request.Context(), req.FileName, req.ContentType, req.FileSize, "servers")
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
			"expires_at": signature.ExpiresAt.Format("2006-01-02T15:04:05Z07:00"),
		},
	})
}

// SetServerAvatar sets the server's avatar by processing an uploaded image.
func SetServerAvatar(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	storageService, ok := getStorageService(c)
	if !ok {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "file uploads are not configured"})
		return
	}

	claims, ok := getUserClaims(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
		return
	}

	serverID := c.Param("serverID")
	if serverID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server ID is required"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).First(&server, serverID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	// Only server owner can update avatar
	if server.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only server owners can update the server avatar"})
		return
	}

	var req models.SetAvatarRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch the uploaded image from storage
	objectReader, _, contentType, err := storageService.GetObject(c.Request.Context(), req.ObjectKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to retrieve uploaded image"})
		return
	}
	defer objectReader.Close()

	if !avatars.IsValidImageType(contentType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid image type"})
		return
	}

	// Convert CropData from models to avatars package type
	var cropData *avatars.CropData
	if req.CropData != nil {
		cropData = &avatars.CropData{
			X:      req.CropData.X,
			Y:      req.CropData.Y,
			Width:  req.CropData.Width,
			Height: req.CropData.Height,
			Scale:  req.CropData.Scale,
		}
	}

	// Process the avatar (crop and resize)
	processedBytes, processedContentType, err := avatars.ProcessAvatar(objectReader, contentType, cropData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to process avatar: %v", err)})
		return
	}

	// Upload the processed thumbnail
	thumbnailReader := bytes.NewReader(processedBytes)
	thumbnailResult, err := storageService.UploadAvatarObject(
		c.Request.Context(),
		"server-avatar-thumbnail.jpg",
		processedContentType,
		int64(len(processedBytes)),
		thumbnailReader,
		"servers",
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload processed avatar"})
		return
	}

	// Serialize crop data for storage
	cropDataJSON := ""
	if req.CropData != nil {
		cropDataJSON, err = avatars.SerializeCropData(cropData)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save crop data"})
			return
		}
	}

	updates := map[string]interface{}{
		"icon":              thumbnailResult.FileURL,
		"icon_original_key": req.ObjectKey,
		"icon_crop_data":    cropDataJSON,
	}

	if err := db.WithContext(c).Model(&server).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update server avatar"})
		return
	}

	// Reload server to get updated values
	if err := db.WithContext(c).Preload("Owner").First(&server, serverID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Server avatar updated successfully",
		"data": gin.H{
			"server": serializeServer(server),
		},
	})
}

// DeleteServerAvatar removes the server's avatar.
func DeleteServerAvatar(c *gin.Context) {
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

	serverID := c.Param("serverID")
	if serverID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "server ID is required"})
		return
	}

	var server models.Server
	if err := db.WithContext(c).First(&server, serverID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load server"})
		return
	}

	// Only server owner can update avatar
	if server.OwnerID != claims.UserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "only server owners can update the server avatar"})
		return
	}

	updates := map[string]interface{}{
		"icon":              "",
		"icon_original_key": "",
		"icon_crop_data":    "",
	}

	if err := db.WithContext(c).Model(&server).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete server avatar"})
		return
	}

	// Reload server to get updated values
	if err := db.WithContext(c).Preload("Owner").First(&server, serverID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reload server"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Server avatar deleted successfully",
		"data": gin.H{
			"server": serializeServer(server),
		},
	})
}
