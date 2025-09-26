# Sociostr Backend

Backend service for Sociostr - a real-time visualization of Nostr users on a world map.

## Features

- Express.js REST API
- WebSocket support for real-time updates
- CORS configured for GitHub Pages
- Health check endpoint
- Ready for Render deployment

## Development

```bash
npm install
npm start
```

## Deployment

This backend is configured to deploy to Render using the `render.yaml` file.

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/nostr-users` - Nostr users (placeholder)

## WebSocket

Real-time updates via WebSocket connection.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## License

MIT
