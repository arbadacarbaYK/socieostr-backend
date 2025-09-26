const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// CORS configuration for GitHub Pages
const corsOptions = {
  origin: [
    'https://arbadacarbaYK.github.io',
    'https://arbadacarbaYK.github.io/sociostr',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Sociostr backend is running',
    timestamp: new Date().toISOString()
  });
});

// Basic Nostr users endpoint (placeholder)
app.get('/api/nostr-users', (req, res) => {
  res.json({
    users: [],
    message: 'Backend is running but Nostr integration not yet implemented'
  });
});

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
  
  // Send a welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Sociostr backend'
  }));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Sociostr backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});