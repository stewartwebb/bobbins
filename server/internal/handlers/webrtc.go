package handlers

import (
    "errors"
    "net/http"
    "strconv"
    "time"

    "bafachat/internal/models"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

type joinWebRTCResponse struct {
    SessionToken string                 `json:"session_token"`
    ExpiresAt    string                 `json:"expires_at"`
    Channel      gin.H                  `json:"channel"`
    Participant  gin.H                  `json:"participant"`
    Participants []map[string]any       `json:"participants"`
    ICEServers   interface{}            `json:"iceservers"`
    SFU          interface{}            `json:"sfu"`
}

type leaveWebRTCRequest struct {
    SessionToken string `json:"session_token" binding:"required"`
}

// JoinWebRTCChannel issues a temporary signaling token and returns current participants/config.
func JoinWebRTCChannel(c *gin.Context) {
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

    rtcManager, ok := getWebRTCManager(c)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "signaling manager unavailable"})
        return
    }

    rtcConfig, ok := getWebRTCConfig(c)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "signaling configuration unavailable"})
        return
    }

    hub, ok := getWebSocketHub(c)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "websocket hub unavailable"})
        return
    }

    channelIDParam := c.Param("id")
    channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
    if err != nil || channelIDValue == 0 {
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

    if channel.Type != models.ChannelTypeAudio {
        c.JSON(http.StatusBadRequest, gin.H{"error": "channel does not support realtime media"})
        return
    }

    var membership models.ServerMember
    if err := db.WithContext(c).
        Where("server_id = ? AND user_id = ?", channel.ServerID, claims.UserID).
        First(&membership).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
        return
    }

    session, err := rtcManager.Issue(claims.UserID, channel.ID, claims.Username, membership.Role)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue session token"})
        return
    }

    participants := hub.WebRTCParticipants(channel.ID)
    serializedParticipants := make([]map[string]any, 0, len(participants))
    for _, participant := range participants {
        serializedParticipants = append(serializedParticipants, map[string]any{
            "user_id":       participant.UserID,
            "display_name":  participant.DisplayName,
            "role":          participant.Role,
            "session_id":    participant.SessionID,
            "media_state":   participant.MediaState,
            "channel_id":    participant.ChannelID,
            "last_seen":     participant.LastSeen.Format(time.RFC3339),
        })
    }

    response := joinWebRTCResponse{
        SessionToken: session.Token,
        ExpiresAt:    session.ExpiresAt.Format(time.RFC3339),
        Channel: gin.H{
            "id":   channel.ID,
            "name": channel.Name,
            "type": channel.Type,
        },
        Participant: gin.H{
            "user_id":      claims.UserID,
            "display_name": claims.Username,
            "role":         membership.Role,
            "session_id":   session.SessionID,
            "media_state": gin.H{
                "mic":    "off",
                "camera": "off",
                "screen": "off",
            },
        },
        Participants: serializedParticipants,
        ICEServers:   rtcConfig.ICEServers,
        SFU:          nil,
    }

    c.JSON(http.StatusOK, gin.H{"data": response})
}

// LeaveWebRTCChannel revokes a signaling session token.
func LeaveWebRTCChannel(c *gin.Context) {
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

    rtcManager, ok := getWebRTCManager(c)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "signaling manager unavailable"})
        return
    }

    channelIDParam := c.Param("id")
    channelIDValue, err := strconv.ParseUint(channelIDParam, 10, 64)
    if err != nil || channelIDValue == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel id"})
        return
    }

    var payload leaveWebRTCRequest
    if err := c.ShouldBindJSON(&payload); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    if payload.SessionToken == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "session token is required"})
        return
    }

    if _, err := rtcManager.Validate(payload.SessionToken, claims.UserID, uint(channelIDValue)); err == nil {
        rtcManager.Revoke(payload.SessionToken)
    }

    if err := ensureServerMembership(db.WithContext(c), uint(channelIDValue), claims.UserID); err != nil {
        switch err {
        case errServerMembershipRequired:
            c.JSON(http.StatusForbidden, gin.H{"error": "membership required"})
            return
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify membership"})
            return
        }
    }

    c.Status(http.StatusNoContent)
}
