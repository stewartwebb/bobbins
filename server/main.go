package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"bafachat/internal/database"
	"bafachat/internal/email"
	"bafachat/internal/handlers"
	"bafachat/internal/middleware"
	"bafachat/internal/queue"
	"bafachat/internal/storage"
	"bafachat/internal/webrtc"
	"bafachat/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Get port from environment or default to 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize database connection
	db := database.GetDB()
	log.Println("Database connection established")

	// Initialize email service
	emailService, err := email.NewServiceFromEnv()
	if err != nil {
		log.Printf("Email service disabled: %v", err)
	} else {
		log.Println("Email service ready")
	}

	// Initialize queue (Redis + Asynq)
	queueCfg := queue.ConfigFromEnv()
	queueClient, err := queue.NewClient(queueCfg)
	if err != nil {
		log.Printf("Queue client disabled: %v", err)
	}

	if queueClient != nil {
		server, serr := queue.NewServer(queueCfg)
		if serr != nil {
			log.Printf("Queue worker disabled: %v", serr)
		} else {
			mux := queue.NewMux(emailService)
			go func() {
				log.Println("Queue worker starting")
				if err := server.Run(mux); err != nil {
					log.Printf("Queue worker stopped: %v", err)
				}
			}()
			log.Println("Queue client ready")
		}
	}

	// Initialize WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Initialize WebRTC signaling manager and config
	rtcManager := webrtc.NewManager(2 * time.Minute)
	rtcConfig := webrtc.ConfigFromEnv()
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			rtcManager.Cleanup()
		}
	}()

	// Initialize storage service
	storageService, storageErr := storage.NewServiceFromEnv(context.Background())
	if storageErr != nil {
		if errors.Is(storageErr, storage.ErrServiceDisabled) {
			log.Println("Storage service disabled (missing configuration)")
		} else {
			log.Printf("Storage service unavailable: %v", storageErr)
		}
	} else {
		log.Println("Storage service ready")
	}

	// Initialize Gin router
	r := gin.Default()

	// Apply middleware
	r.Use(middleware.CORSMiddleware())
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(func(c *gin.Context) {
		c.Set("db", db)
		if emailService != nil {
			c.Set("email", emailService)
		}
		if queueClient != nil {
			c.Set("queue", queueClient)
		}
		if storageErr == nil && storageService != nil {
			c.Set("storage", storageService)
		}
		c.Set("wsHub", hub)
		c.Set("webrtcManager", rtcManager)
		c.Set("webrtcConfig", rtcConfig)
		c.Next()
	})

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "bafachat-server",
		})
	})

	// API routes
	api := r.Group("/api/v1")
	{
		// User authentication routes
		auth := api.Group("/auth")
		{
			auth.POST("/register", handlers.Register)
			auth.POST("/login", handlers.Login)
			auth.POST("/logout", handlers.Logout)
			auth.GET("/verify-email", handlers.VerifyEmail)
		}

		api.GET("/invites/:code", handlers.GetInvite)

		// Protected routes (require authentication)
		protected := api.Group("/")
		protected.Use(middleware.AuthMiddleware())
		{
			// User routes
			protected.GET("/users/me", handlers.GetCurrentUser)
			protected.POST("/users/lookup", handlers.LookupUsers)
			protected.PUT("/users/me", handlers.UpdateCurrentUser)
			protected.POST("/users/me/avatar/presign", handlers.PresignUserAvatarUpload)
			protected.POST("/users/me/avatar", handlers.SetUserAvatar)
			protected.DELETE("/users/me/avatar", handlers.DeleteUserAvatar)

			// Server/Guild routes
			protected.GET("/servers", handlers.GetServers)
			protected.POST("/servers", handlers.CreateServer)
			protected.GET("/servers/:serverID", handlers.GetServer)
			protected.GET("/servers/:serverID/participants", handlers.GetServerChannelParticipants)
			protected.POST("/servers/:serverID/invites", handlers.CreateServerInvite)
			protected.POST("/servers/:serverID/avatar/presign", handlers.PresignServerAvatarUpload)
			protected.POST("/servers/:serverID/avatar", handlers.SetServerAvatar)
			protected.DELETE("/servers/:serverID/avatar", handlers.DeleteServerAvatar)

			// Channel routes
			protected.GET("/servers/:serverID/channels", handlers.GetChannels)
			protected.POST("/channels", handlers.CreateChannel)
			protected.GET("/channels/:id/messages", handlers.GetMessages)
			protected.POST("/channels/:id/messages", handlers.CreateMessage)
			protected.POST("/channels/:id/messages/attachments", handlers.UploadAttachmentMessage)
			protected.POST("/channels/:id/attachments/presign", handlers.CreateAttachmentUpload)
			protected.POST("/channels/:id/typing", handlers.SendTypingIndicator)
			protected.POST("/channels/:id/webrtc/join", handlers.JoinWebRTCChannel)
			protected.POST("/channels/:id/webrtc/leave", handlers.LeaveWebRTCChannel)

			protected.POST("/invites/:code/accept", handlers.AcceptInvite)
		}
	}

	// WebSocket endpoint
	r.GET("/ws", func(c *gin.Context) {
		websocket.HandleWebSocket(hub, rtcManager, c)
	})

	// Start server
	log.Printf("Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
