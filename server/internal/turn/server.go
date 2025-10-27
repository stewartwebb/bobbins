package turn

import (
"fmt"
"log"
"net"
"os"
"strconv"
"strings"

"github.com/pion/turn/v3"
)

// Server wraps a pion TURN server instance.
type Server struct {
server *turn.Server
config Config
}

// Config holds the TURN server configuration.
type Config struct {
// PublicIP is the public IP address of the TURN server
PublicIP string
// Port is the UDP port for TURN server (default: 3478)
Port int
// Realm is the TURN server realm (default: "bafachat")
Realm string
// Username for TURN authentication
Username string
// Password for TURN authentication
Password string
// Enabled indicates if TURN server should be started
Enabled bool
}

// ConfigFromEnv loads TURN server configuration from environment variables.
//
// Supported env vars:
//   TURN_ENABLED       - Set to "true" to enable the TURN server (default: false)
//   TURN_PUBLIC_IP     - Public IP address for TURN server (required if enabled)
//   TURN_PORT          - UDP port for TURN server (default: 3478)
//   TURN_REALM         - TURN server realm (default: "bafachat")
//   TURN_USERNAME      - Username for TURN authentication (default: "bafachat")
//   TURN_PASSWORD      - Password for TURN authentication (required if enabled)
func ConfigFromEnv() Config {
enabled := strings.ToLower(strings.TrimSpace(os.Getenv("TURN_ENABLED"))) == "true"

config := Config{
PublicIP: strings.TrimSpace(os.Getenv("TURN_PUBLIC_IP")),
Realm:    strings.TrimSpace(os.Getenv("TURN_REALM")),
Username: strings.TrimSpace(os.Getenv("TURN_USERNAME")),
Password: strings.TrimSpace(os.Getenv("TURN_PASSWORD")),
Enabled:  enabled,
}

// Set defaults
if config.Realm == "" {
config.Realm = "bafachat"
}
if config.Username == "" {
config.Username = "bafachat"
}

// Parse port
portStr := strings.TrimSpace(os.Getenv("TURN_PORT"))
if portStr == "" {
config.Port = 3478
} else {
port, err := strconv.Atoi(portStr)
if err != nil {
log.Printf("Invalid TURN_PORT value '%s', using default 3478", portStr)
config.Port = 3478
} else {
config.Port = port
}
}

return config
}

// Validate checks if the configuration is valid.
func (c Config) Validate() error {
if !c.Enabled {
return fmt.Errorf("TURN server is disabled")
}
if c.PublicIP == "" {
return fmt.Errorf("TURN_PUBLIC_IP is required when TURN is enabled")
}
if c.Password == "" {
return fmt.Errorf("TURN_PASSWORD is required when TURN is enabled")
}
if c.Port < 1 || c.Port > 65535 {
return fmt.Errorf("TURN_PORT must be between 1 and 65535")
}
return nil
}

// GetTURNURL returns the TURN server URL that clients should use.
func (c Config) GetTURNURL() string {
return fmt.Sprintf("turn:%s:%d", c.PublicIP, c.Port)
}

// NewServer creates and starts a new TURN server.
func NewServer(config Config) (*Server, error) {
if err := config.Validate(); err != nil {
return nil, err
}

// Create UDP listener
udpListener, err := net.ListenPacket("udp4", fmt.Sprintf("0.0.0.0:%d", config.Port))
if err != nil {
return nil, fmt.Errorf("failed to create UDP listener: %w", err)
}

// Create TURN server with authentication handler
turnServer, err := turn.NewServer(turn.ServerConfig{
Realm: config.Realm,
// AuthHandler validates username/password for TURN authentication
AuthHandler: func(username, realm string, srcAddr net.Addr) ([]byte, bool) {
if username == config.Username && realm == config.Realm {
// Return the password as key for authentication
return turn.GenerateAuthKey(username, realm, config.Password), true
}
return nil, false
},
// PacketConnConfigs specifies the UDP listener
PacketConnConfigs: []turn.PacketConnConfig{
{
PacketConn: udpListener,
RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
RelayAddress: net.ParseIP(config.PublicIP),
Address:      "0.0.0.0",
},
},
},
})
if err != nil {
udpListener.Close()
return nil, fmt.Errorf("failed to create TURN server: %w", err)
}

return &Server{
server: turnServer,
config: config,
}, nil
}

// Close shuts down the TURN server.
func (s *Server) Close() error {
if s.server != nil {
return s.server.Close()
}
return nil
}

// Config returns the server's configuration.
func (s *Server) Config() Config {
return s.config
}
