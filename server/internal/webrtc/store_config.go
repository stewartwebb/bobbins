package webrtc

import (
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// RedisStoreConfig captures connection details for the Redis-backed token store.
type RedisStoreConfig struct {
	Addr     string
	Password string
	DB       int
	Prefix   string
}

// RedisStoreConfigFromEnv reads configuration from environment variables.
// Supported variables (in priority order):
//
//	WEBRTC_REDIS_URL        - full redis URL including credentials/path.
//	WEBRTC_REDIS_ADDR       - host:port override.
//	WEBRTC_REDIS_PASSWORD   - password for redis authentication.
//	WEBRTC_REDIS_DB         - database index (integer).
//	WEBRTC_REDIS_PREFIX     - key prefix for stored session tokens.
//
// When WEBRTC_* variables are absent, the generic REDIS_URL environment
// variable is used as a fallback so existing single-redis deployments continue
// to work without extra configuration.
func RedisStoreConfigFromEnv() RedisStoreConfig {
	cfg := RedisStoreConfig{}

	applyURL := func(raw string) {
		if raw == "" {
			return
		}
		if addr, password, db, ok := parseRedisURL(raw); ok {
			if addr != "" {
				cfg.Addr = addr
			}
			if password != "" {
				cfg.Password = password
			}
			cfg.DB = db
		}
	}

	applyURL(strings.TrimSpace(os.Getenv("WEBRTC_REDIS_URL")))
	if cfg.Addr == "" {
		applyURL(strings.TrimSpace(os.Getenv("REDIS_URL")))
	}

	if raw := strings.TrimSpace(os.Getenv("WEBRTC_REDIS_ADDR")); raw != "" {
		cfg.Addr = raw
	}

	if raw := os.Getenv("WEBRTC_REDIS_PASSWORD"); raw != "" {
		cfg.Password = raw
	}

	if raw := strings.TrimSpace(os.Getenv("WEBRTC_REDIS_DB")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			cfg.DB = parsed
		}
	}

	if raw := strings.TrimSpace(os.Getenv("WEBRTC_REDIS_PREFIX")); raw != "" {
		cfg.Prefix = raw
	}

	if cfg.Prefix == "" {
		cfg.Prefix = defaultRedisTokenPrefix
	}

	return cfg
}

func parseRedisURL(raw string) (addr, password string, db int, ok bool) {
	if raw == "" {
		return "", "", 0, false
	}

	u, err := url.Parse(raw)
	if err != nil {
		return "", "", 0, false
	}

	if host := u.Hostname(); host != "" {
		port := u.Port()
		if port == "" {
			port = "6379"
		}
		addr = net.JoinHostPort(host, port)
	} else if u.Host != "" {
		addr = u.Host
	}

	if u.User != nil {
		password, _ = u.User.Password()
	}

	path := strings.TrimPrefix(u.Path, "/")
	if path != "" {
		if parsed, err := strconv.Atoi(path); err == nil {
			db = parsed
		}
	}

	if rawDB := u.Query().Get("db"); rawDB != "" {
		if parsed, err := strconv.Atoi(rawDB); err == nil {
			db = parsed
		}
	}

	return addr, password, db, true
}
