package models

import "time"

const (
	ServerRoleOwner  = "owner"
	ServerRoleMember = "member"

	ChannelTypeText  = "text"
	ChannelTypeAudio = "audio"

	MessageTypeText = "text"
	MessageTypeFile = "file"
)

// User represents a user in the system.
type User struct {
	ID                      uint       `json:"id" gorm:"primaryKey"`
	Username                string     `json:"username" gorm:"unique;not null"`
	Email                   string     `json:"email" gorm:"unique;not null"`
	Password                string     `json:"-" gorm:"not null"`
	Avatar                  string     `json:"avatar"`
	EmailVerifiedAt         *time.Time `json:"email_verified_at"`
	EmailVerificationToken  string     `json:"-" gorm:"size:191"`
	EmailVerificationSentAt *time.Time `json:"-"`
	LastLoginAt             *time.Time `json:"last_login_at"`
	CreatedAt               time.Time  `json:"created_at"`
	UpdatedAt               time.Time  `json:"updated_at"`
}

// ServerMember represents a user's membership within a server, including their role.
type ServerMember struct {
	ServerID  uint      `json:"server_id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"primaryKey"`
	Role      string    `json:"role" gorm:"size:32;default:'member'"`
	JoinedAt  time.Time `json:"joined_at" gorm:"autoCreateTime"`
	InvitedBy *uint     `json:"invited_by"`
}

// Server represents a Discord-like server/guild.
type Server struct {
	ID              uint           `json:"id" gorm:"primaryKey"`
	Name            string         `json:"name" gorm:"not null"`
	Description     string         `json:"description"`
	Icon            string         `json:"icon"`
	OwnerID         uint           `json:"owner_id" gorm:"not null"`
	Owner           User           `json:"owner" gorm:"foreignKey:OwnerID"`
	Channels        []Channel      `json:"channels" gorm:"foreignKey:ServerID"`
	Members         []User         `json:"members" gorm:"many2many:server_members;"`
	MemberRelations []ServerMember `json:"-" gorm:"foreignKey:ServerID"`
	Invites         []ServerInvite `json:"-" gorm:"foreignKey:ServerID"`
	CurrentMemberRole string       `json:"current_member_role,omitempty" gorm:"-"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// Channel represents a channel within a server.
type Channel struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	Name        string    `json:"name" gorm:"not null"`
	Description string    `json:"description"`
	Type        string    `json:"type" gorm:"default:'text'"`
	ServerID    uint      `json:"server_id" gorm:"not null"`
	Server      Server    `json:"server" gorm:"foreignKey:ServerID"`
	Messages    []Message `json:"messages" gorm:"foreignKey:ChannelID"`
	Position    int       `json:"position" gorm:"default:0"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Message represents a message in a channel.
type Message struct {
	ID          uint                `json:"id" gorm:"primaryKey"`
	Content     string              `json:"content" gorm:"not null"`
	UserID      uint                `json:"user_id" gorm:"not null"`
	User        User                `json:"user" gorm:"foreignKey:UserID"`
	ChannelID   uint                `json:"channel_id" gorm:"not null"`
	Channel     Channel             `json:"channel" gorm:"foreignKey:ChannelID"`
	Type        string              `json:"type" gorm:"default:'text'"`
	Attachments []MessageAttachment `json:"attachments" gorm:"foreignKey:MessageID"`
	EditedAt    *time.Time          `json:"edited_at"`
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

// MessageAttachment stores metadata for files linked to messages.
type MessageAttachment struct {
	ID          uint      `json:"id" gorm:"primaryKey"`
	MessageID   uint      `json:"message_id" gorm:"index;not null"`
	ObjectKey   string    `json:"object_key" gorm:"size:512;not null"`
	URL         string    `json:"url" gorm:"size:1024;not null"`
	FileName    string    `json:"file_name" gorm:"size:255;not null"`
	ContentType string    `json:"content_type" gorm:"size:255;not null"`
	FileSize    int64     `json:"file_size" gorm:"not null"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	PreviewURL  string    `json:"preview_url" gorm:"size:1024"`
	PreviewObjectKey string `json:"preview_object_key" gorm:"size:512"`
	PreviewWidth int       `json:"preview_width"`
	PreviewHeight int      `json:"preview_height"`
	CreatedAt   time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// ServerInvite represents a reusable invite link to join a server.
type ServerInvite struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	Code      string     `json:"code" gorm:"size:64;uniqueIndex"`
	ServerID  uint       `json:"server_id" gorm:"not null"`
	Server    Server     `json:"server" gorm:"foreignKey:ServerID"`
	InviterID uint       `json:"inviter_id" gorm:"not null"`
	Inviter   User       `json:"inviter" gorm:"foreignKey:InviterID"`
	MaxUses   int        `json:"max_uses"`
	Uses      int        `json:"uses"`
	ExpiresAt *time.Time `json:"expires_at"`
	RevokedAt *time.Time `json:"revoked_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// LoginRequest represents the login request payload.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// RegisterRequest represents the registration request payload.
type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=32"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// CreateServerRequest represents the create server request payload.
type CreateServerRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

// CreateChannelRequest represents the create channel request payload.
type CreateChannelRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description"`
	Type        string `json:"type"`
	ServerID    uint   `json:"server_id" binding:"required"`
	Position    int    `json:"position"`
}

// CreateMessageRequest represents the payload to create a channel message.
type CreateMessageRequest struct {
	Content     string                    `json:"content"`
	Type        string                    `json:"type"`
	Attachments []CreateMessageAttachment `json:"attachments"`
}

// CreateMessageAttachment captures attachment metadata supplied by clients after uploading to object storage.
type CreateMessageAttachment struct {
	ObjectKey   string `json:"object_key" binding:"required"`
	URL         string `json:"url" binding:"required"`
	FileName    string `json:"file_name" binding:"required"`
	ContentType string `json:"content_type" binding:"required"`
	FileSize    int64  `json:"file_size" binding:"required"`
}

// CreateServerInviteRequest captures the payload for generating invite links and optional email sends.
type CreateServerInviteRequest struct {
	ExpiresInHours int      `json:"expires_in_hours"`
	MaxUses        int      `json:"max_uses"`
	Emails         []string `json:"emails"`
	Message        string   `json:"message"`
}
