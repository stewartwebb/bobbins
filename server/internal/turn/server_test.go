package turn

import (
"os"
"testing"
)

func TestConfigFromEnv(t *testing.T) {
// Save original env vars
origEnabled := os.Getenv("TURN_ENABLED")
origPublicIP := os.Getenv("TURN_PUBLIC_IP")
origPort := os.Getenv("TURN_PORT")
origRealm := os.Getenv("TURN_REALM")
origUsername := os.Getenv("TURN_USERNAME")
origPassword := os.Getenv("TURN_PASSWORD")

// Clean up after test
defer func() {
os.Setenv("TURN_ENABLED", origEnabled)
os.Setenv("TURN_PUBLIC_IP", origPublicIP)
os.Setenv("TURN_PORT", origPort)
os.Setenv("TURN_REALM", origRealm)
os.Setenv("TURN_USERNAME", origUsername)
os.Setenv("TURN_PASSWORD", origPassword)
}()

tests := []struct {
name     string
envVars  map[string]string
expected Config
}{
{
name: "disabled by default",
envVars: map[string]string{
"TURN_ENABLED": "",
},
expected: Config{
Enabled:  false,
Port:     3478,
Realm:    "bafachat",
Username: "bafachat",
},
},
{
name: "enabled with custom config",
envVars: map[string]string{
"TURN_ENABLED":   "true",
"TURN_PUBLIC_IP": "1.2.3.4",
"TURN_PORT":      "3479",
"TURN_REALM":     "custom",
"TURN_USERNAME":  "testuser",
"TURN_PASSWORD":  "testpass",
},
expected: Config{
Enabled:  true,
PublicIP: "1.2.3.4",
Port:     3479,
Realm:    "custom",
Username: "testuser",
Password: "testpass",
},
},
{
name: "default port and realm",
envVars: map[string]string{
"TURN_ENABLED":   "true",
"TURN_PUBLIC_IP": "5.6.7.8",
"TURN_PASSWORD":  "pass123",
},
expected: Config{
Enabled:  true,
PublicIP: "5.6.7.8",
Port:     3478,
Realm:    "bafachat",
Username: "bafachat",
Password: "pass123",
},
},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
// Clear all env vars first
os.Unsetenv("TURN_ENABLED")
os.Unsetenv("TURN_PUBLIC_IP")
os.Unsetenv("TURN_PORT")
os.Unsetenv("TURN_REALM")
os.Unsetenv("TURN_USERNAME")
os.Unsetenv("TURN_PASSWORD")

// Set test env vars
for k, v := range tt.envVars {
os.Setenv(k, v)
}

config := ConfigFromEnv()

if config.Enabled != tt.expected.Enabled {
t.Errorf("Enabled: got %v, want %v", config.Enabled, tt.expected.Enabled)
}
if config.PublicIP != tt.expected.PublicIP {
t.Errorf("PublicIP: got %v, want %v", config.PublicIP, tt.expected.PublicIP)
}
if config.Port != tt.expected.Port {
t.Errorf("Port: got %v, want %v", config.Port, tt.expected.Port)
}
if config.Realm != tt.expected.Realm {
t.Errorf("Realm: got %v, want %v", config.Realm, tt.expected.Realm)
}
if config.Username != tt.expected.Username {
t.Errorf("Username: got %v, want %v", config.Username, tt.expected.Username)
}
if config.Password != tt.expected.Password {
t.Errorf("Password: got %v, want %v", config.Password, tt.expected.Password)
}
})
}
}

func TestConfigValidate(t *testing.T) {
tests := []struct {
name    string
config  Config
wantErr bool
}{
{
name: "valid config",
config: Config{
Enabled:  true,
PublicIP: "1.2.3.4",
Password: "secure-password",
Port:     3478,
},
wantErr: false,
},
{
name: "disabled config",
config: Config{
Enabled: false,
},
wantErr: true,
},
{
name: "missing public IP",
config: Config{
Enabled:  true,
Password: "secure-password",
},
wantErr: true,
},
{
name: "missing password",
config: Config{
Enabled:  true,
PublicIP: "1.2.3.4",
},
wantErr: true,
},
{
name: "invalid port",
config: Config{
Enabled:  true,
PublicIP: "1.2.3.4",
Password: "secure-password",
Port:     99999,
},
wantErr: true,
},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
err := tt.config.Validate()
if (err != nil) != tt.wantErr {
t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
}
})
}
}

func TestConfigGetTURNURL(t *testing.T) {
tests := []struct {
name   string
config Config
want   string
}{
{
name: "default port",
config: Config{
PublicIP: "1.2.3.4",
Port:     3478,
},
want: "turn:1.2.3.4:3478",
},
{
name: "custom port",
config: Config{
PublicIP: "example.com",
Port:     8080,
},
want: "turn:example.com:8080",
},
}

for _, tt := range tests {
t.Run(tt.name, func(t *testing.T) {
got := tt.config.GetTURNURL()
if got != tt.want {
t.Errorf("GetTURNURL() = %v, want %v", got, tt.want)
}
})
}
}
