const geoip = require('geoip-lite');
const dns = require('dns').promises;

class GeolocationResolver {
  constructor() {
    this.fallbackLocations = [
      { lat: 40.7128, lng: -74.0060, country: 'United States', city: 'New York' },
      { lat: 51.5074, lng: -0.1278, country: 'United Kingdom', city: 'London' },
      { lat: 48.8566, lng: 2.3522, country: 'France', city: 'Paris' },
      { lat: 52.5200, lng: 13.4050, country: 'Germany', city: 'Berlin' },
      { lat: 35.6762, lng: 139.6503, country: 'Japan', city: 'Tokyo' },
      { lat: -33.8688, lng: 151.2093, country: 'Australia', city: 'Sydney' },
      { lat: 55.7558, lng: 37.6176, country: 'Russia', city: 'Moscow' },
      { lat: 19.4326, lng: -99.1332, country: 'Mexico', city: 'Mexico City' },
      { lat: -22.9068, lng: -43.1729, country: 'Brazil', city: 'Rio de Janeiro' },
      { lat: 28.6139, lng: 77.2090, country: 'India', city: 'New Delhi' }
    ];
  }

  async resolveUserLocation(user) {
    const { about, nip05, picture } = user;
    
    // Try multiple resolution methods
    let location = null;
    let confidence = 0.1; // Default low confidence
    
    // Method 1: Extract location from about text
    if (about && typeof about === 'string') {
      location = this.extractLocationFromText(about);
      if (location) {
        confidence = 0.7;
        return { ...location, confidence, method: 'about_text' };
      }
    }
    
    // Method 2: Resolve NIP-05 domain
    if (nip05 && typeof nip05 === 'string' && nip05.includes('@')) {
      try {
        const domain = nip05.split('@')[1];
        location = await this.resolveDomainToIP(domain);
        if (location) {
          confidence = 0.6;
          return { ...location, confidence, method: 'nip05_domain' };
        }
      } catch (error) {
        // Continue to next method
      }
    }
    
    // Method 3: Resolve website domain from about text
    if (about && typeof about === 'string') {
      const websiteMatch = about.match(/https?:\/\/([^\/\s]+)/);
      if (websiteMatch) {
        try {
          const domain = websiteMatch[1];
          location = await this.resolveDomainToIP(domain);
          if (location) {
            confidence = 0.5;
            return { ...location, confidence, method: 'website_domain' };
          }
        } catch (error) {
          // Continue to next method
        }
      }
    }
    
    // Method 4: Resolve profile picture domain
    if (picture && typeof picture === 'string') {
      try {
        const url = new URL(picture);
        const domain = url.hostname;
        location = await this.resolveDomainToIP(domain);
        if (location) {
          confidence = 0.4;
          return { ...location, confidence, method: 'picture_domain' };
        }
      } catch (error) {
        // Continue to fallback
      }
    }
    
    // No location found - return null instead of fallback
    return {
      latitude: null,
      longitude: null,
      country: null,
      city: null,
      confidence: 0,
      method: 'none'
    };
  }

  extractLocationFromText(text) {
    if (!text || typeof text !== 'string') return null;
    
    const locationPatterns = [
      // City, Country patterns
      /(?:in|from|based in|located in|live in|living in)\s+([^,]+),\s*([^,\.\n]+)/i,
      // Just city
      /(?:in|from|based in|located in|live in|living in)\s+([^,\.\n]+)/i,
      // Country only
      /(?:from|based in|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    
    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        const location = match[1]?.trim();
        const country = match[2]?.trim();
        
        if (location) {
          // Try to find coordinates for this location
          const coordinates = this.findCoordinatesForLocation(location, country);
          if (coordinates) {
            return {
              city: location,
              country: country || 'Unknown',
              latitude: coordinates.lat,
              longitude: coordinates.lng
            };
          }
        }
      }
    }
    
    return null;
  }

  findCoordinatesForLocation(city, country) {
    if (!city) return null;
    
    // Normalize the input for comparison
    const normalizedCity = city.toLowerCase().trim();
    const normalizedCountry = country ? country.toLowerCase().trim() : '';
    
    // Check fallback locations first
    for (const location of this.fallbackLocations) {
      const fallbackCity = location.city.toLowerCase();
      const fallbackCountry = location.country.toLowerCase();
      
      // Exact match
      if (fallbackCity === normalizedCity) {
        return { lat: location.lat, lng: location.lng };
      }
      
      // Partial match (city contains or is contained in the fallback city)
      if (fallbackCity.includes(normalizedCity) || normalizedCity.includes(fallbackCity)) {
        // If country is specified, it should match too
        if (!country || fallbackCountry.includes(normalizedCountry) || normalizedCountry.includes(fallbackCountry)) {
          return { lat: location.lat, lng: location.lng };
        }
      }
    }
    
    return null;
  }

  async resolveDomainToIP(domain) {
    if (!domain || typeof domain !== 'string') return null;
    
    // Basic domain validation
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) return null;
    
    try {
      const addresses = await Promise.race([
        dns.resolve4(domain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 2000))
      ]);
      
      if (addresses && addresses.length > 0) {
        const ip = addresses[0];
        const geo = geoip.lookup(ip);
        
        if (geo) {
          return {
            latitude: geo.ll[0],
            longitude: geo.ll[1],
            country: geo.country,
            city: geo.city || 'Unknown',
            region: geo.region || 'Unknown'
          };
        }
      }
    } catch (error) {
      // DNS resolution failed or timeout
      return null;
    }
    
    return null;
  }
}

module.exports = GeolocationResolver;
