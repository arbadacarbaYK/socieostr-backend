const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const NostrDataFetcher = require('./src/nostr-data-fetcher');
const GeolocationResolver = require('./src/geolocation-resolver');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Nostr data fetcher and geolocation resolver
const nostrFetcher = new NostrDataFetcher();
const geoResolver = new GeolocationResolver();

// CORS configuration for GitHub Pages
const corsOptions = {
  origin: [
    'https://arbadacarbaYK.github.io',
    'https://arbadacarbayk.github.io',
    'https://arbadacarbaYK.github.io/sociostr',
    'https://arbadacarbayk.github.io/sociostr',
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

// Nostr users endpoint
app.get('/api/nostr-users', async (req, res) => {
  try {
    const { since } = req.query;
    const sinceTimestamp = since ? parseInt(since) : null;
    
    console.log('Fetching Nostr users...');
    const users = await nostrFetcher.fetchUsers(2000, sinceTimestamp);
    
    res.json({
      users: users,
      message: `Fetched ${users.length} users from Nostr relays`
    });
  } catch (error) {
    console.error('Error fetching Nostr users:', error);
    res.status(500).json({
      users: [],
      message: 'Error fetching users from Nostr relays',
      error: error.message
    });
  }
});

// Process users with geolocation
app.post('/api/process-users', async (req, res) => {
  try {
    const { users } = req.body;
    
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Invalid users data' });
    }
    
    console.log(`Processing ${users.length} users for geolocation...`);
    
    const processedUsers = [];
    const batchSize = 10; // Process in batches to avoid overwhelming the system
    
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const batchPromises = batch.map(async (user) => {
        try {
          const location = await geoResolver.resolveUserLocation(user);
          
          // Only include fallback location if user has some location data but needs refinement
          // If no location was found at all, keep the null values
          if (location.method === 'none') {
            // User has no location data - return as is
            return {
              ...user,
              location
            };
          }
          
          return {
            ...user,
            location
          };
        } catch (error) {
          console.error(`Error processing user ${user.pubkey}:`, error);
          // Return user with no location data on error
          return {
            ...user,
            location: {
              latitude: null,
              longitude: null,
              country: null,
              city: null,
              confidence: 0,
              method: 'none'
            }
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const user = result.value;
          // Only include users that have a real location (not 'none')
          if (user.location && user.location.method !== 'none') {
            processedUsers.push(user);
          }
        }
      });
    }
    
    console.log(`Successfully processed ${processedUsers.length} users`);
    
    res.json({
      users: processedUsers,
      message: `Processed ${processedUsers.length} users with geolocation`
    });
  } catch (error) {
    console.error('Error processing users:', error);
    res.status(500).json({
      error: 'Error processing users',
      message: error.message
    });
  }
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