package database

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"bafachat/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	dbInstance *gorm.DB
	once       sync.Once
)

// GetDB returns a singleton database connection.
func GetDB() *gorm.DB {
	once.Do(func() {
		var err error
		dbInstance, err = connect()
		if err != nil {
			log.Fatalf("failed to connect to database: %v", err)
		}

		if err := autoMigrate(dbInstance); err != nil {
			log.Fatalf("failed to run database migrations: %v", err)
		}
	})

	return dbInstance
}

func connect() (*gorm.DB, error) {
	timezone := getEnv("DB_TIMEZONE", "UTC")
	schema := getEnv("DB_SCHEMA", "public")

	dsn, ok := os.LookupEnv("DATABASE_URL")
	if !ok || dsn == "" {
		host := getEnv("DB_HOST", "localhost")
		port := getEnv("DB_PORT", "5435")
		user := getEnv("DB_USER", "postgres")
		password := getEnv("DB_PASSWORD", "postgres")
		name := getEnv("DB_NAME", "bafachat")
		sslMode := getEnv("DB_SSLMODE", "disable")

		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
			host,
			port,
			user,
			password,
			name,
			sslMode,
			timezone,
		)
	} else if !hasTimezone(dsn) {
		dsn = appendTimezone(dsn, timezone)
	}

	if schema != "" && !hasSearchPath(dsn) {
		dsn = appendSearchPath(dsn, schema)
	}

	config := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	db, err := gorm.Open(postgres.Open(dsn), config)
	if err != nil {
		return nil, err
	}

	dbSQL, err := db.DB()
	if err != nil {
		return nil, err
	}

	dbSQL.SetMaxIdleConns(10)
	dbSQL.SetMaxOpenConns(25)
	dbSQL.SetConnMaxLifetime(5 * time.Minute)

	if err := ensureSchemaExists(db, schema); err != nil {
		return nil, err
	}

	return db, nil
}

func autoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.Server{},
		&models.ServerMember{},
		&models.Channel{},
		&models.Message{},
		&models.MessageAttachment{},
		&models.ServerInvite{},
	)
}

func getEnv(key, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}

	return value
}

func hasTimezone(dsn string) bool {
	lower := strings.ToLower(dsn)
	if strings.Contains(lower, "timezone=") {
		return true
	}

	if strings.Contains(dsn, "://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return false
		}
		query := parsed.Query()
		if query.Get("TimeZone") != "" || query.Get("timezone") != "" {
			return true
		}
	}

	return false
}

func appendTimezone(dsn, timezone string) string {
	if strings.Contains(dsn, "://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return dsn
		}

		query := parsed.Query()
		if query.Get("TimeZone") == "" && query.Get("timezone") == "" {
			query.Set("timezone", timezone)
			parsed.RawQuery = query.Encode()
		}

		return parsed.String()
	}

	trimmed := strings.TrimSpace(dsn)
	if trimmed == "" {
		return fmt.Sprintf("TimeZone=%s", timezone)
	}

	return fmt.Sprintf("%s TimeZone=%s", trimmed, timezone)
}

func hasSearchPath(dsn string) bool {
	lower := strings.ToLower(dsn)
	if strings.Contains(lower, "search_path=") {
		return true
	}

	if strings.Contains(dsn, "://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return false
		}
		query := parsed.Query()
		if query.Get("search_path") != "" {
			return true
		}
	}

	return false
}

func appendSearchPath(dsn, schema string) string {
	if schema == "" {
		return dsn
	}

	value := formatSchemaForSearchPath(schema)

	if strings.Contains(dsn, "://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return dsn
		}

		query := parsed.Query()
		query.Set("search_path", value)
		parsed.RawQuery = query.Encode()
		return parsed.String()
	}

	trimmed := strings.TrimSpace(dsn)
	if trimmed == "" {
		return fmt.Sprintf("search_path=%s", value)
	}

	return fmt.Sprintf("%s search_path=%s", trimmed, value)
}

func ensureSchemaExists(db *gorm.DB, schema string) error {
	return nil
	
	/*
	if schema == "" {
		return nil
	}

	stmt := fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", quoteIdentifier(schema))
	return db.Exec(stmt).Error
	*/
}

func formatSchemaForSearchPath(schema string) string {
	if schema == "" {
		return schema
	}

	if requiresQuoting(schema) {
		return quoteIdentifier(schema)
	}

	return schema
}

func requiresQuoting(identifier string) bool {
	if identifier == strings.ToLower(identifier) && !strings.ContainsAny(identifier, "- ") {
		return false
	}

	return true
}

func quoteIdentifier(identifier string) string {
	escaped := strings.ReplaceAll(identifier, "\"", "\"\"")
	return fmt.Sprintf("\"%s\"", escaped)
}
