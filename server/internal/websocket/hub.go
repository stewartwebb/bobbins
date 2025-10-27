package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"bafachat/internal/auth"
	"bafachat/internal/webrtc"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// MediaState describes the mute/published status of a participant's tracks.
type MediaState struct {
	Mic    string `json:"mic"`
	Camera string `json:"camera"`
	Screen string `json:"screen"`
}

// Participant represents an active WebRTC session.
type Participant struct {
	UserID      uint       `json:"user_id"`
	DisplayName string     `json:"display_name"`
	Role        string     `json:"role"`
	ChannelID   uint       `json:"channel_id"`
	SessionID   string     `json:"session_id"`
	MediaState  MediaState `json:"media_state"`
	LastSeen    time.Time  `json:"last_seen"`
}

type outboundEnvelope struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Hub coordinates websocket clients and relays channel or WebRTC updates.
type Hub struct {
	mu           sync.RWMutex
	clients      map[*Client]bool
	broadcast    chan []byte
	register     chan *Client
	unregister   chan *Client
	participants map[uint]map[uint]*Participant
}

// Client represents a websocket client connection.
type Client struct {
	hub             *Hub
	conn            *websocket.Conn
	send            chan []byte
	userID          uint
	username        string
	activeChannelID uint
	webrtcManager   *webrtc.Manager
	webrtcToken     string
	webrtcChannelID uint
	webrtcSessionID string
	webrtcActive    bool
}

// Message represents a websocket message.
type Message struct {
	Type      string      `json:"type"`
	Data      interface{} `json:"data"`
	UserID    string      `json:"user_id,omitempty"`
	ChannelID string      `json:"channel_id,omitempty"`
	Timestamp string      `json:"timestamp"`
}

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	// Railway.com recommends sending keepalive traffic every 10-30 seconds.
	// We use 25 seconds as it's within their range and less than pongWait.
	pingPeriod = 25 * time.Second

	// Maximum message size allowed from peer
	maxMessageSize = 512 * 1024 // 512KB
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from any origin for development.
		// In production we should implement strict origin validation.
		return true
	},
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	return &Hub{
		broadcast:    make(chan []byte),
		register:     make(chan *Client),
		unregister:   make(chan *Client),
		clients:      make(map[*Client]bool),
		participants: make(map[uint]map[uint]*Participant),
	}
}

// Run processes client registration and message fan-out.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected (user=%d). Total clients: %d", client.userID, len(h.clients))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected (user=%d). Total clients: %d", client.userID, len(h.clients))

		case message := <-h.broadcast:
			h.mu.RLock()
			clients := make([]*Client, 0, len(h.clients))
			for client := range h.clients {
				clients = append(clients, client)
			}
			h.mu.RUnlock()

			for _, client := range clients {
				select {
				case client.send <- message:
				default:
					h.forceDisconnect(client)
				}
			}
		}
	}
}

// HandleWebSocket upgrades HTTP requests into websocket connections.
func HandleWebSocket(hub *Hub, manager *webrtc.Manager, c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	token := ""
	if authHeader != "" {
		parts := strings.Fields(authHeader)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			token = parts[1]
		}
	}

	if token == "" {
		token = strings.TrimSpace(c.Query("token"))
	}

	if token == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	claims, err := auth.ParseJWT(token)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	client := &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		userID:        claims.UserID,
		username:      claims.Username,
		webrtcManager: manager,
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.handleSessionLeave("disconnect")
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var envelope struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(message, &envelope); err != nil {
			continue
		}

		switch strings.ToLower(envelope.Type) {
		case "channel.select":
			var payload struct {
				ChannelID uint `json:"channel_id"`
			}
			if err := json.Unmarshal(envelope.Data, &payload); err == nil {
				c.activeChannelID = payload.ChannelID
			}

		case "channel.leave":
			var payload struct {
				ChannelID uint `json:"channel_id"`
			}
			if err := json.Unmarshal(envelope.Data, &payload); err == nil {
				if c.activeChannelID == payload.ChannelID {
					c.activeChannelID = 0
				}
			}

		case "session.authenticate":
			c.handleSessionAuthenticate(envelope.Data)

		case "session.leave", "webrtc.end_session":
			c.handleSessionLeave("client")

		case "participant.update":
			c.handleParticipantUpdate(envelope.Data)

		case "webrtc.offer":
			c.handleWebRTCSignal("webrtc.offer", envelope.Data)

		case "webrtc.answer":
			c.handleWebRTCSignal("webrtc.answer", envelope.Data)

		case "webrtc.ice_candidate":
			c.handleWebRTCSignal("webrtc.ice_candidate", envelope.Data)
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error: %v", err)
				return
			}
		}
	}
}

// Publish sends a payload to all connected clients.
func (h *Hub) Publish(payload interface{}) error {
	message, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	go func() {
		h.broadcast <- message
	}()

	return nil
}

func (c *Client) handleSessionAuthenticate(raw json.RawMessage) {
	if c.webrtcManager == nil {
		c.sendError("session.unavailable", "signaling service unavailable")
		return
	}

	var payload struct {
		SessionToken string `json:"session_token"`
		ChannelID    uint   `json:"channel_id"`
	}

	if err := json.Unmarshal(raw, &payload); err != nil || payload.SessionToken == "" || payload.ChannelID == 0 {
		c.sendError("session.invalid", "invalid session payload")
		return
	}

	session, err := c.webrtcManager.Validate(payload.SessionToken, c.userID, payload.ChannelID)
	if err != nil {
		c.sendError("session.invalid", "failed to validate session token")
		return
	}

	if c.webrtcActive {
		c.handleSessionLeave("re-auth")
	}

	participant := Participant{
		UserID:      session.UserID,
		DisplayName: session.DisplayName,
		Role:        session.Role,
		ChannelID:   session.ChannelID,
		SessionID:   session.SessionID,
		MediaState: MediaState{
			Mic:    "off",
			Camera: "off",
			Screen: "off",
		},
		LastSeen: time.Now(),
	}

	c.webrtcToken = payload.SessionToken
	c.webrtcChannelID = session.ChannelID
	c.webrtcSessionID = session.SessionID
	c.webrtcActive = true

	c.hub.addParticipant(&participant)

	c.sendJSON(outboundEnvelope{
		Type: "session.ready",
		Data: map[string]interface{}{
			"channel_id": session.ChannelID,
		},
	})

	c.hub.broadcastToChannel(session.ChannelID, outboundEnvelope{
		Type: "participant.joined",
		Data: participant,
	}, c.userID)
}

func (c *Client) handleSessionLeave(reason string) {
	if !c.webrtcActive {
		return
	}

	removed := c.hub.removeParticipant(c.webrtcChannelID, c.userID)
	if removed != nil {
		c.hub.broadcastToChannel(c.webrtcChannelID, outboundEnvelope{
			Type: "participant.left",
			Data: map[string]interface{}{
				"user_id":    removed.UserID,
				"channel_id": removed.ChannelID,
				"reason":     reason,
			},
		}, c.userID)
	}

	if c.webrtcManager != nil && c.webrtcToken != "" {
		c.webrtcManager.Revoke(c.webrtcToken)
	}

	c.webrtcToken = ""
	c.webrtcChannelID = 0
	c.webrtcSessionID = ""
	c.webrtcActive = false
}

func (c *Client) handleParticipantUpdate(raw json.RawMessage) {
	if !c.webrtcActive {
		c.sendError("session.required", "webrtc session not active")
		return
	}

	var payload struct {
		MediaState MediaState `json:"media_state"`
	}

	if err := json.Unmarshal(raw, &payload); err != nil {
		c.sendError("participant.invalid", "invalid participant payload")
		return
	}

	participant := c.hub.updateParticipantState(c.webrtcChannelID, c.userID, payload.MediaState)
	if participant == nil {
		c.sendError("participant.missing", "participant not registered")
		return
	}

	c.hub.broadcastToChannel(c.webrtcChannelID, outboundEnvelope{
		Type: "participant.updated",
		Data: map[string]interface{}{
			"user_id":     participant.UserID,
			"channel_id":  participant.ChannelID,
			"media_state": participant.MediaState,
			"session_id":  participant.SessionID,
		},
	}, 0)
}

func (c *Client) handleWebRTCSignal(eventType string, raw json.RawMessage) {
	if !c.webrtcActive {
		c.sendError("session.required", "webrtc session not active")
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		c.sendError("webrtc.invalid", "invalid signaling payload")
		return
	}

	targetValue, ok := payload["target_user_id"]
	if !ok {
		c.sendError("webrtc.invalid", "missing target user")
		return
	}

	targetUserID, ok := toUint(targetValue)
	if !ok || targetUserID == 0 {
		c.sendError("webrtc.invalid", "invalid target user")
		return
	}

	payload["from_user_id"] = c.userID
	payload["channel_id"] = c.webrtcChannelID
	payload["session_id"] = c.webrtcSessionID

	if !c.hub.sendToUser(targetUserID, outboundEnvelope{Type: eventType, Data: payload}) {
		log.Printf("WebRTC signal delivery failed: channel=%d from=%d to=%d (target unavailable)", c.webrtcChannelID, c.userID, targetUserID)
	}
}

func (c *Client) sendJSON(payload interface{}) {
	bytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	select {
	case c.send <- bytes:
	default:
		close(c.send)
	}
}

func (c *Client) sendError(code, message string) {
	c.sendJSON(outboundEnvelope{
		Type: "session.error",
		Data: map[string]interface{}{
			"code":    code,
			"message": message,
		},
	})
}

func (h *Hub) forceDisconnect(client *Client) {
	h.mu.Lock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
	}
	h.mu.Unlock()
}

func (h *Hub) addParticipant(p *Participant) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.participants[p.ChannelID]; !ok {
		h.participants[p.ChannelID] = make(map[uint]*Participant)
	}

	clone := *p
	h.participants[p.ChannelID][p.UserID] = &clone
}

func (h *Hub) removeParticipant(channelID, userID uint) *Participant {
	h.mu.Lock()
	defer h.mu.Unlock()

	channelParticipants, ok := h.participants[channelID]
	if !ok {
		return nil
	}

	participant, ok := channelParticipants[userID]
	if !ok {
		return nil
	}

	delete(channelParticipants, userID)
	if len(channelParticipants) == 0 {
		delete(h.participants, channelID)
	}

	clone := *participant
	return &clone
}

func (h *Hub) updateParticipantState(channelID, userID uint, state MediaState) *Participant {
	h.mu.Lock()
	defer h.mu.Unlock()

	channelParticipants, ok := h.participants[channelID]
	if !ok {
		return nil
	}

	participant, ok := channelParticipants[userID]
	if !ok {
		return nil
	}

	participant.MediaState = state
	participant.LastSeen = time.Now()
	clone := *participant
	return &clone
}

// WebRTCParticipants returns the active participants for a specific channel.
func (h *Hub) WebRTCParticipants(channelID uint) []Participant {
	h.mu.RLock()
	defer h.mu.RUnlock()

	channelParticipants, ok := h.participants[channelID]
	if !ok {
		return nil
	}

	list := make([]Participant, 0, len(channelParticipants))
	for _, participant := range channelParticipants {
		clone := *participant
		list = append(list, clone)
	}

	return list
}

func (h *Hub) broadcastToChannel(channelID uint, payload interface{}, excludeUserID uint) {
	message, err := json.Marshal(payload)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	for _, client := range clients {
		if excludeUserID != 0 && client.userID == excludeUserID {
			continue
		}

		select {
		case client.send <- message:
		default:
			h.forceDisconnect(client)
		}
	}
}

func (h *Hub) sendToUser(userID uint, payload interface{}) bool {
	message, err := json.Marshal(payload)
	if err != nil {
		return false
	}

	h.mu.RLock()
	clients := make([]*Client, 0, len(h.clients))
	for client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	sent := false
	for _, client := range clients {
		if !client.webrtcActive || client.userID != userID {
			continue
		}

		sent = true
		select {
		case client.send <- message:
		default:
			h.forceDisconnect(client)
		}
	}

	return sent
}

func toUint(value interface{}) (uint, bool) {
	switch v := value.(type) {
	case float64:
		return uint(v), true
	case int:
		return uint(v), true
	case int32:
		return uint(v), true
	case int64:
		return uint(v), true
	case uint:
		return v, true
	case uint32:
		return uint(v), true
	case uint64:
		return uint(v), true
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return uint(i), true
		}
	}
	return 0, false
}
