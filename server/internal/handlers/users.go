package handlers

import (
	"net/http"

	"bafachat/internal/models"

	"github.com/gin-gonic/gin"
)

const maxUserLookupBatch = 64

type lookupUsersRequest struct {
	UserIDs []uint `json:"user_ids" binding:"required"`
}

// LookupUsers returns basic profile details for the provided user IDs.
func LookupUsers(c *gin.Context) {
	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	var req lookupUsersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request payload"})
		return
	}

	normalized := make([]uint, 0, len(req.UserIDs))
	unique := make(map[uint]struct{}, len(req.UserIDs))
	for _, id := range req.UserIDs {
		if id == 0 {
			continue
		}
		if _, exists := unique[id]; exists {
			continue
		}
		unique[id] = struct{}{}
		normalized = append(normalized, id)
		if len(normalized) >= maxUserLookupBatch {
			break
		}
	}

	if len(normalized) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"users": []gin.H{}, "missing_user_ids": []uint{}}})
		return
	}

	var users []models.User
	if err := db.WithContext(c).
		Select("id", "username", "avatar").
		Where("id IN ?", normalized).
		Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lookup users"})
		return
	}

	serialized := make([]gin.H, 0, len(users))
	found := make(map[uint]struct{}, len(users))
	for _, user := range users {
		serialized = append(serialized, gin.H{
			"id":       user.ID,
			"username": user.Username,
			"avatar":   user.Avatar,
		})
		found[user.ID] = struct{}{}
	}

	missing := make([]uint, 0)
	for _, id := range normalized {
		if _, ok := found[id]; !ok {
			missing = append(missing, id)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"users":            serialized,
			"missing_user_ids": missing,
		},
	})
}
