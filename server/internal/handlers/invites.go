package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"bafachat/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	errInviteNotFound    = errors.New("invite not found")
	errInviteExpired     = errors.New("invite expired")
	errInviteRevoked     = errors.New("invite revoked")
	errInviteMaxed       = errors.New("invite has reached its maximum uses")
)

// GetInvite returns information about an invite code.
func GetInvite(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code is required"})
		return
	}

	db, ok := getDB(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database connection unavailable"})
		return
	}

	var invite models.ServerInvite
	if err := db.WithContext(c).
		Preload("Server").
		Preload("Server.Owner").
		Where("code = ?", code).
		First(&invite).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": errInviteNotFound.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load invite"})
		return
	}

	if err := validateInvite(invite); err != nil {
		status := http.StatusBadRequest
		switch err {
		case errInviteExpired, errInviteRevoked:
			status = http.StatusGone
		case errInviteMaxed:
			status = http.StatusForbidden
		}

		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"invite": serializeInvite(invite),
			"server": serializeServer(invite.Server),
		},
	})
}

// AcceptInvite allows an authenticated user to join the server associated with an invite.
func AcceptInvite(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invite code is required"})
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

	var invite models.ServerInvite
	err := db.WithContext(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Server").
			Where("code = ?", code).
			First(&invite).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return errInviteNotFound
			}
			return err
		}

		if err := validateInvite(invite); err != nil {
			return err
		}

		if err := ensureServerMembership(tx, invite.ServerID, claims.UserID); err == nil {
			return nil
		} else if !errors.Is(err, errServerMembershipRequired) {
			return err
		}

		member := models.ServerMember{
			ServerID: invite.ServerID,
			UserID:   claims.UserID,
			Role:     models.ServerRoleMember,
		}
		inviterID := invite.InviterID
		member.InvitedBy = &inviterID

		if err := tx.Create(&member).Error; err != nil && !errors.Is(err, gorm.ErrDuplicatedKey) {
			return err
		}

		if err := incrementInviteUsage(tx, &invite); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		switch err {
		case errInviteNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errInviteExpired, errInviteRevoked:
			c.JSON(http.StatusGone, gin.H{"error": err.Error()})
		case errInviteMaxed:
			c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		case errServerMembershipRequired:
			// Should not hit due to earlier check, but handle defensively.
			c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to accept invite"})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Invite accepted",
		"data": gin.H{
			"invite": serializeInvite(invite),
			"server": serializeServer(invite.Server),
		},
	})
}

func validateInvite(invite models.ServerInvite) error {
	if invite.RevokedAt != nil {
		return errInviteRevoked
	}

	if invite.ExpiresAt != nil && time.Now().After(*invite.ExpiresAt) {
		return errInviteExpired
	}

	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		return errInviteMaxed
	}

	return nil
}

func incrementInviteUsage(tx *gorm.DB, invite *models.ServerInvite) error {
	if invite.MaxUses > 0 && invite.Uses >= invite.MaxUses {
		return errInviteMaxed
	}

	if err := tx.Model(invite).Where("id = ?", invite.ID).UpdateColumn("uses", gorm.Expr("uses + 1")).Error; err != nil {
		return err
	}

	invite.Uses++
	return nil
}
