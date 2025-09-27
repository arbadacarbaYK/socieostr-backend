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
          
          // Add fallback location if no location was resolved
          if (!location.latitude || !location.longitude) {
            const fallbackIndex = Math.floor(Math.random() * geoResolver.fallbackLocations.length);
            const fallback = geoResolver.fallbackLocations[fallbackIndex];
            location.latitude = fallback.lat;
            location.longitude = fallback.lng;
            location.country = fallback.country;
            location.city = fallback.city;
            location.confidence = 0.1;
            location.method = 'fallback';
          }
          
          return {
            ...user,
            location,
            fallbackLocation: {
              lat: location.latitude,
              lng: location.longitude,
              country: location.country,
              city: location.city
            }
          };
        } catch (error) {
          console.error(`Error processing user ${user.pubkey}:`, error);
          // Return user with fallback location
          const fallbackIndex = Math.floor(Math.random() * geoResolver.fallbackLocations.length);
          const fallback = geoResolver.fallbackLocations[fallbackIndex];
          
          return {
            ...user,
            location: {
              latitude: fallback.lat,
              longitude: fallback.lng,
              country: fallback.country,
              city: fallback.city,
              confidence: 0.1,
              method: 'fallback'
            },
            fallbackLocation: {
              lat: fallback.lat,
              lng: fallback.lng,
              country: fallback.country,
              city: fallback.city
            }
          };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          processedUsers.push(result.value);
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