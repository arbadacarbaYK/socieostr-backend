const WebSocket = require('ws');
const dns = require('dns').promises;

class NostrDataFetcher {
  constructor() {
    this.relays = [
      'wss://relay.damus.io',
      'wss://relay.snort.social',
      'wss://nos.lol',
      'wss://relay.nostr.band',
      'wss://purplepag.es'
    ];
    this.users = new Map();
    this.pendingProfileLookups = new Map();
  }

  async fetchUsers(limit = 1000, since = null) {
    console.log(`Fetching ${limit} users from Nostr relays...`);
    
    const promises = this.relays.map(relay => this.fetchFromRelay(relay, limit, since));
    const results = await Promise.allSettled(promises);
    
    const allUsers = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allUsers.push(...result.value);
        console.log(`Relay ${this.relays[index]}: ${result.value.length} users`);
      } else {
        console.error(`Relay ${this.relays[index]} failed:`, result.reason);
      }
    });

    // Remove duplicates based on pubkey
    const uniqueUsers = new Map();
    allUsers.forEach(user => {
      if (!uniqueUsers.has(user.pubkey)) {
        uniqueUsers.set(user.pubkey, user);
      }
    });

    const finalUsers = Array.from(uniqueUsers.values());
    console.log(`Total unique users: ${finalUsers.length}`);
    
    return finalUsers;
  }

  async fetchFromRelay(relayUrl, limit, since = null) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl);
      const users = [];
      let timeout;

      ws.on('open', () => {
        console.log(`Connected to ${relayUrl}`);
        
        const subscriptionId = `sub_${Date.now()}`;
        const filter = {
          kinds: [0, 1, 9735], // 0=profiles, 1=posts, 9735=zaps
          limit: limit
        };
        
        // Add timestamp filter for auto-updates
        if (since) {
          filter.since = since;
          console.log(`Fetching events since ${new Date(since * 1000).toISOString()}`);
        }
        
        const subscription = [
          'REQ',
          subscriptionId,
          filter
        ];
        
        ws.send(JSON.stringify(subscription));
        
        // Set timeout
        timeout = setTimeout(() => {
          ws.close();
          resolve(users);
        }, 20000); // 20 second timeout
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          if (message[0] === 'EVENT') {
            const event = message[2];
            const user = this.parseEvent(event);
            if (user) {
              users.push(user);
            }
          } else if (message[0] === 'EOSE') {
            // End of stored events
            clearTimeout(timeout);
            ws.close();
            
            // Fetch profiles for users from posts/zaps
            if (this.pendingProfileLookups.size > 0) {
              this.fetchProfilesForPubkeys(relayUrl).then(() => {
                resolve(users);
              }).catch(() => {
                resolve(users);
              });
            } else {
              resolve(users);
            }
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${relayUrl}:`, error);
        clearTimeout(timeout);
        resolve(users);
      });

      ws.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  parseEvent(event) {
    const { kind, pubkey, content, created_at } = event;
    
    if (kind === 0) {
      // Profile event
      return this.parseProfileEvent(event, 'profile');
    } else if (kind === 1) {
      // Post event - create basic user entry
      const user = {
        pubkey,
        name: `User ${pubkey.slice(0, 8)}`,
        about: '',
        picture: '',
        nip05: '',
        activityType: 'post',
        lastSeen: created_at
      };
      
      // Store for profile lookup
      this.pendingProfileLookups.set(pubkey, user);
      return user;
    } else if (kind === 9735) {
      // Zap event - create basic user entry
      const user = {
        pubkey,
        name: `User ${pubkey.slice(0, 8)}`,
        about: '',
        picture: '',
        nip05: '',
        activityType: 'zap',
        lastSeen: created_at
      };
      
      // Store for profile lookup
      this.pendingProfileLookups.set(pubkey, user);
      return user;
    }
    
    return null;
  }

  parseProfileEvent(event, activityType = 'profile') {
    const { pubkey, content, created_at } = event;
    
    try {
      const profile = JSON.parse(content);
      const { name, display_name, username, displayName, about, picture, nip05 } = profile;
      
      // Handle multiple name fields according to NIP-01 and NIP-24
      let finalName = name;
      let displayNameField = display_name;
      let rawName = name;
      
      if (display_name && display_name !== name) {
        finalName = display_name;
        displayNameField = display_name;
        rawName = name;
      } else if (username && username !== name) {
        finalName = username;
        rawName = name;
      } else if (displayName && displayName !== name) {
        finalName = displayName;
        rawName = name;
      }
      
      return {
        pubkey,
        name: finalName || `User ${pubkey.slice(0, 8)}`,
        display_name: displayNameField,
        raw_name: rawName,
        about: about || '',
        picture: picture || '',
        nip05: nip05 || '',
        activityType,
        lastSeen: created_at
      };
    } catch (error) {
      console.error('Error parsing profile:', error);
      return {
        pubkey,
        name: `User ${pubkey.slice(0, 8)}`,
        about: '',
        picture: '',
        nip05: '',
        activityType,
        lastSeen: created_at
      };
    }
  }

  async fetchProfilesForPubkeys(relayUrl) {
    if (this.pendingProfileLookups.size === 0) return;
    
    const pubkeys = Array.from(this.pendingProfileLookups.keys());
    const pubkeyDataMap = new Map();
    
    pubkeys.forEach(pubkey => {
      const userData = this.pendingProfileLookups.get(pubkey);
      pubkeyDataMap.set(pubkey, userData);
    });
    
    return this.fetchProfilesFromRelay(relayUrl, pubkeyDataMap);
  }

  async fetchProfilesFromRelay(relayUrl, pubkeyDataMap) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl);
      let timeout;

      ws.on('open', () => {
        const subscriptionId = `profiles_${Date.now()}`;
        const filter = {
          kinds: [0],
          authors: Array.from(pubkeyDataMap.keys())
        };
        
        const subscription = [
          'REQ',
          subscriptionId,
          filter
        ];
        
        ws.send(JSON.stringify(subscription));
        
        timeout = setTimeout(() => {
          ws.close();
          resolve();
        }, 10000);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          
          if (message[0] === 'EVENT') {
            const event = message[2];
            const pubkey = event.pubkey;
            
            if (pubkeyDataMap.has(pubkey)) {
              const userData = pubkeyDataMap.get(pubkey);
              const profile = this.parseProfileEvent(event, userData.activityType);
              
              // Update the user data with profile information
              Object.assign(userData, profile);
            }
          } else if (message[0] === 'EOSE') {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (error) {
          console.error('Error parsing profile message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error(`Profile fetch error for ${relayUrl}:`, error);
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

module.exports = NostrDataFetcher;
