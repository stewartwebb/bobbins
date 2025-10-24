package handlers

import (
	"log"

	"bafachat/internal/auth"
	"bafachat/internal/email"
	"bafachat/internal/models"
	"bafachat/internal/storage"
	"bafachat/internal/webrtc"
	"bafachat/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/hibiken/asynq"
	"gorm.io/gorm"
)

func getDB(c *gin.Context) (*gorm.DB, bool) {
	value, exists := c.Get("db")
	if !exists {
		log.Println("database connection not found in context")
		return nil, false
	}

	db, ok := value.(*gorm.DB)
	if !ok {
		log.Println("invalid database connection type")
		return nil, false
	}

	return db, true
}

func getEmailService(c *gin.Context) (*email.Service, bool) {
	value, exists := c.Get("email")
	if !exists {
		return nil, false
	}

	svc, ok := value.(*email.Service)
	if !ok {
		log.Println("invalid email service type")
		return nil, false
	}

	return svc, true
}

func getQueueClient(c *gin.Context) (*asynq.Client, bool) {
	value, exists := c.Get("queue")
	if !exists {
		return nil, false
	}

	client, ok := value.(*asynq.Client)
	if !ok {
		log.Println("invalid queue client type")
		return nil, false
	}

	return client, true
}

func getWebSocketHub(c *gin.Context) (*websocket.Hub, bool) {
	value, exists := c.Get("wsHub")
	if !exists {
		return nil, false
	}

	hub, ok := value.(*websocket.Hub)
	if !ok {
		log.Println("invalid websocket hub type")
		return nil, false
	}

	return hub, true
}

func getStorageService(c *gin.Context) (*storage.Service, bool) {
	value, exists := c.Get("storage")
	if !exists {
		return nil, false
	}

	service, ok := value.(*storage.Service)
	if !ok {
		log.Println("invalid storage service type")
		return nil, false
	}

	return service, true
}

func getWebRTCManager(c *gin.Context) (*webrtc.Manager, bool) {
	value, exists := c.Get("webrtcManager")
	if !exists {
		return nil, false
	}

	manager, ok := value.(*webrtc.Manager)
	if !ok {
		log.Println("invalid webrtc manager type")
		return nil, false
	}

	return manager, true
}

func getWebRTCConfig(c *gin.Context) (webrtc.Config, bool) {
	value, exists := c.Get("webrtcConfig")
	if !exists {
		return webrtc.Config{}, false
	}

	config, ok := value.(webrtc.Config)
	if !ok {
		log.Println("invalid webrtc config type")
		return webrtc.Config{}, false
	}

	return config, true
}

func getUserClaims(c *gin.Context) (*auth.Claims, bool) {
	value, exists := c.Get("userClaims")
	if !exists {
		return nil, false
	}

	claims, ok := value.(*auth.Claims)
	if !ok {
		log.Println("invalid user claims type")
		return nil, false
	}

	return claims, true
}

func getCurrentUserRecord(c *gin.Context) (*models.User, bool) {
	db, ok := getDB(c)
	if !ok {
		return nil, false
	}

	claims, ok := getUserClaims(c)
	if !ok {
		return nil, false
	}

	var user models.User
	if err := db.WithContext(c).First(&user, claims.UserID).Error; err != nil {
		log.Printf("failed to load current user: %v", err)
		return nil, false
	}

	return &user, true
}
