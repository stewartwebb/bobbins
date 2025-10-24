package webrtc

import (
    "encoding/json"
    "log"
    "os"
    "strings"
)

// ICEServer mirrors the WebRTC RTCIceServer configuration.
type ICEServer struct {
    URLs       []string `json:"urls"`
    Username   string   `json:"username,omitempty"`
    Credential string   `json:"credential,omitempty"`
}

// Config contains WebRTC signaling configuration to share with clients.
type Config struct {
    ICEServers []ICEServer
}

// ConfigFromEnv loads configuration from environment variables.
//
// Supported env vars:
//   WEBRTC_ICE_SERVERS  - JSON array of RTCIceServer objects.
//                         Example: [{"urls":["stun:stun.l.google.com:19302"]}]
// If unset, a default Google STUN server is provided for development.
func ConfigFromEnv() Config {
    raw := strings.TrimSpace(os.Getenv("WEBRTC_ICE_SERVERS"))
    if raw == "" {
        return Config{
            ICEServers: []ICEServer{{
                URLs: []string{"stun:stun.l.google.com:19302"},
            }},
        }
    }

    var servers []ICEServer
    if err := json.Unmarshal([]byte(raw), &servers); err != nil {
        log.Printf("Invalid WEBRTC_ICE_SERVERS value: %v", err)
        return Config{
            ICEServers: []ICEServer{{
                URLs: []string{"stun:stun.l.google.com:19302"},
            }},
        }
    }

    if len(servers) == 0 {
        servers = []ICEServer{{
            URLs: []string{"stun:stun.l.google.com:19302"},
        }}
    }

    return Config{ICEServers: servers}
}
