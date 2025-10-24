<!-- Workspace-specific instructions for Discord alternative (BafaChat) -->

This is a monorepo project for a Discord alternative called BafaChat with:
- Go backend in `/server` directory 
- React frontend in `/client` directory
- Shared configuration at root level

## Project Structure
- `/server/` - Go backend with REST API and WebSocket support
- `/client/` - React frontend with TypeScript
- Root level contains monorepo configuration

## Development Guidelines
- Use Go modules for backend dependency management
- Use npm/yarn workspaces for frontend dependencies
- Follow RESTful API design patterns
- Use WebSockets for real-time messaging
- Implement proper error handling and logging

## Key Features to Implement
- User authentication and authorization
- Real-time messaging with WebSockets
- Channel/server management
- File sharing capabilities
- Voice/video calling (future enhancement)