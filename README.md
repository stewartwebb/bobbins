# BafaChat

A modern Discord alternative built with Go backend and React frontend. BafaChat provides real-time messaging, server/channel management, and a clean user interface similar to Discord.

## 🚀 Features

- **Real-time messaging** with WebSocket support
- **Server and channel management** 
- **User authentication** and authorization
- **Modern UI** with React and TypeScript
- **RESTful API** built with Go and Gin
- **Monorepo structure** for easy development

## 🏗️ Project Structure

```
bafachat/
├── server/                 # Go backend
│   ├── main.go            # Server entry point
│   ├── go.mod             # Go module dependencies
│   ├── .env.example       # Environment variables template
│   └── internal/          # Internal packages
│       ├── handlers/      # HTTP request handlers
│       ├── middleware/    # HTTP middleware
│       ├── models/        # Data models
│       └── websocket/     # WebSocket implementation
├── client/                # React frontend
│   ├── public/           # Static assets
│   ├── src/              # Source code
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API services
│   │   ├── types/        # TypeScript types
│   │   └── hooks/        # Custom React hooks
│   ├── package.json      # Frontend dependencies
│   └── tsconfig.json     # TypeScript configuration
├── package.json          # Monorepo configuration
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## 🛠️ Technology Stack

### Backend
- **Go 1.21+** - Programming language
- **Gin** - HTTP web framework
- **Gorilla WebSocket** - WebSocket implementation
- **godotenv** - Environment variable management
- **GORM** - ORM for data access
- **PostgreSQL** - Primary relational data store
- **Postmark** - Transactional email delivery

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling with sky-inspired theme
- **React Router** - Client-side routing
- **Axios** - HTTP client

### Development Tools
- **Concurrently** - Run multiple commands simultaneously
- **npm workspaces** - Monorepo package management

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **Go** (v1.21 or higher)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/bafachat.git
   cd bafachat
   ```

2. **Install dependencies**
   ```bash
   npm run setup
   ```
   This command will:
   - Install frontend dependencies (`npm run install:client`)
   - Download Go modules and tidy dependencies (`npm run install:server`)

3. **Set up environment variables**
   ```bash
   cp server/.env.example server/.env
   ```
   Edit `server/.env` with your configuration values.

4. **Start PostgreSQL** (local development)
   ```bash
   docker run --name bafachat-postgres \
     -e POSTGRES_DB=bafachat \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -p 5432:5432 -d postgres:16
   ```
   The default DSN matches values from `server/.env.example`.

### Development

#### Start both frontend and backend simultaneously
```bash
npm run dev
```
This command automatically starts a local PostgreSQL container (`bafachat-postgres`) if one is not already running, then launches the backend and frontend in parallel.

#### Start services individually

**Backend only:**
```bash
npm run dev:server
# or
cd server && go run main.go
```

**Frontend only:**
```bash
npm run dev:client
# or
cd client && npm start
```

The application will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **WebSocket**: ws://localhost:8080/ws

### Building for Production

#### Build everything
```bash
npm run build
```

#### Build individually
```bash
# Build client
npm run build:client

# Build server
npm run build:server
```

### Testing

#### Run all tests
```bash
npm test
```

#### Run tests individually
```bash
# Frontend tests
npm run test:client

# Backend tests
npm run test:server
```

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout

### Users
- `GET /api/v1/users/me` - Get current user profile
- `PUT /api/v1/users/me` - Update current user profile

### Servers
- `GET /api/v1/servers` - Get user's servers
- `POST /api/v1/servers` - Create a new server
- `GET /api/v1/servers/:id` - Get server details

### Channels
- `GET /api/v1/servers/:serverID/channels` - Get server channels
- `POST /api/v1/channels` - Create a new channel
- `GET /api/v1/channels/:id/messages` - Get channel messages

### WebSocket
- `GET /ws` - WebSocket connection for real-time messaging

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `server/` directory:

```env
PORT=8080
GIN_MODE=debug

# Database (to be configured)
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=bafachat
# DB_PASSWORD=password
# DB_NAME=bafachat

# JWT (to be configured)
# JWT_SECRET=your-secret-key
# JWT_EXPIRES_IN=24h

# Application base URL (used in email verification links)
APP_BASE_URL=http://localhost:3000

# Postmark (to be configured)
# POSTMARK_SERVER_TOKEN=your-postmark-server-token
# POSTMARK_FROM_EMAIL=no-reply@yourdomain.com
# POSTMARK_FROM_NAME=BafaChat
# POSTMARK_MESSAGE_STREAM=outbound
```

## 🏃‍♀️ Development Workflow

1. **Feature Development**
   - Create feature branches from `main`
   - Make changes in respective directories (`server/` or `client/`)
   - Test changes using `npm run dev`

2. **Code Structure**
   - Follow Go conventions for backend code
   - Use TypeScript and React best practices for frontend
   - Keep API types consistent between frontend and backend

3. **Adding Dependencies**
   ```bash
   # Frontend dependencies
   cd client && npm install <package-name>
   
   # Backend dependencies
   cd server && go get <package-name>
   ```

## 🚧 Current Status

This is the basic project setup. The following features are **implemented as placeholders** and need full implementation:

### Backend (Go)
- ✅ Basic server setup with Gin
- ✅ Route structure for auth, servers, channels
- ✅ WebSocket hub implementation
- ✅ CORS middleware
- ✅ PostgreSQL connection with GORM auto-migrations
- ✅ Postmark email client scaffolding
- ⚠️ **TODO**: Repository layer and persistence logic
- ⚠️ **TODO**: JWT authentication
- ⚠️ **TODO**: Password hashing
- ⚠️ **TODO**: Message persistence
- ⚠️ **TODO**: User management

### Frontend (React)
- ✅ Basic React app with TypeScript
- ✅ Login and Chat pages
- ✅ API service structure
- ✅ Basic UI components
- ⚠️ **TODO**: Real-time WebSocket integration
- ⚠️ **TODO**: State management (Context/Redux)
- ⚠️ **TODO**: Complete authentication flow
- ⚠️ **TODO**: Message persistence
- ⚠️ **TODO**: Server/channel management UI

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔮 Roadmap

- [ ] Database integration (PostgreSQL)
- [ ] Complete authentication system
- [ ] Message persistence and history
- [ ] File upload and sharing
- [ ] Voice channels
- [ ] User presence indicators
- [ ] Server permissions system
- [ ] Push notifications
- [ ] Mobile responsiveness
- [ ] Docker containerization
- [ ] CI/CD pipeline

---

**Happy Coding!** 🎉