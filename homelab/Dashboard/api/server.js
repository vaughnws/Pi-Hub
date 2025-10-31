const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const Docker = require('dockerode');
const os = require('os');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
const docker = new Docker();
const PORT = 3333;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('/data/homelab.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating messages table:', err);
    } else {
      console.log('Messages table ready');
    }
  });
}

// System Stats Endpoint
app.get('/api/system/stats', async (req, res) => {
  try {
    const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((totalMem - freeMem) / totalMem) * 100;
    
    let diskUsage = 0;
    try {
      const { execSync } = require('child_process');
      const dfOutput = execSync("df -h / | tail -1 | awk '{print $5}'").toString().trim();
      diskUsage = parseInt(dfOutput.replace('%', ''));
    } catch (e) {
      console.error('Error getting disk usage:', e);
    }
    
    let temp = 0;
    try {
      if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
        const tempRaw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        temp = parseInt(tempRaw) / 1000;
      }
    } catch (e) {
      console.error('Error reading temperature:', e);
    }
    
    const uptimeSeconds = os.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeDays = Math.floor(uptimeHours / 24);
    const remainingHours = uptimeHours % 24;
    const uptimeStr = uptimeDays > 0 ? `${uptimeDays}d ${remainingHours}h` : `${uptimeHours}h`;
    
    res.json({
      cpu: Math.round(cpuUsage),
      ram: Math.round(memUsage),
      disk: diskUsage,
      temp: Math.round(temp),
      uptime: uptimeStr
    });
  } catch (error) {
    console.error('Error getting system stats:', error);
    res.status(500).json({ error: 'Failed to get system stats' });
  }
});

// Network Stats Endpoint
app.get('/api/network/stats', (req, res) => {
  try {
    const networkInterfaces = os.networkInterfaces();
    const stats = [];
    
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      const ipv4 = interfaces.find(i => i.family === 'IPv4');
      if (ipv4 && !ipv4.internal) {
        stats.push({
          interface: name,
          address: ipv4.address,
          netmask: ipv4.netmask,
          mac: ipv4.mac
        });
      }
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting network stats:', error);
    res.status(500).json({ error: 'Failed to get network stats' });
  }
});

// Container List Endpoint
app.get('/api/docker/containers', async (req, res) => {
  try {
    const allContainers = await docker.listContainers({ all: true });
    const containers = allContainers.filter(c => 
      !c.Image.includes('hello-world')
    );
    const containerInfo = containers.map(c => ({
      id: c.Id,
      name: c.Names[0].replace('/', ''),
      status: c.State,
      uptime: c.Status,
      image: c.Image
    }));
    res.json(containerInfo);
  } catch (error) {
    console.error('Error listing containers:', error);
    res.status(500).json({ error: 'Failed to list containers' });
  }
});

// Recent Logs from All Containers
app.get('/api/docker/recent-logs', async (req, res) => {
  try {
    const containers = await docker.listContainers();
    const recentLogs = [];
    
    for (const container of containers.slice(0, 5)) {
      try {
        const containerObj = docker.getContainer(container.Id);
        const logs = await containerObj.logs({
          stdout: true,
          stderr: true,
          tail: 3,
          timestamps: true
        });

        const logLines = logs.toString('utf8')
          .split('\n')
          .map(line => line.substring(8))
          .filter(line => line.trim());

        logLines.forEach(line => {
          recentLogs.push({
            container: container.Names[0].replace('/', ''),
            message: line,
            timestamp: new Date().toISOString()
          });
        });
      } catch (e) {
        console.error(`Error getting logs for ${container.Names[0]}:`, e.message);
      }
    }
    
    res.json(recentLogs.slice(-20));
  } catch (error) {
    console.error('Error getting recent logs:', error);
    res.status(500).json({ error: 'Failed to get recent logs' });
  }
});

// Docker Control Endpoint
app.post('/api/docker/:action', async (req, res) => {
  const { action } = req.params;
  const { container } = req.body;
  
  try {
    if (action === 'start-all' || action === 'stop-all' || action === 'restart-all') {
      const containers = await docker.listContainers({ all: true });
      const promises = containers.map(async (c) => {
        const containerObj = docker.getContainer(c.Id);
        try {
          if (action === 'start-all') {
            if (c.State !== 'running') await containerObj.start();
          } else if (action === 'stop-all') {
            if (c.State === 'running') await containerObj.stop();
          } else if (action === 'restart-all') {
            if (c.State === 'running') await containerObj.restart();
          }
        } catch (e) {
          console.error(`Error with container ${c.Names[0]}:`, e.message);
        }
      });
      await Promise.all(promises);
      res.json({ success: true, message: `${action} completed` });
    } else {
      const containerObj = docker.getContainer(container);

      if (action === 'start') {
        await containerObj.start();
      } else if (action === 'stop') {
        await containerObj.stop();
      } else if (action === 'restart') {
        await containerObj.restart();
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      res.json({ success: true, message: `Container ${container} ${action}ed` });
    }
  } catch (error) {
    console.error(`Error performing ${action}:`, error);
    res.status(500).json({ error: `Failed to ${action} container: ${error.message}` });
  }
});

// Calendar Endpoint
app.get('/api/calendar', async (req, res) => {
  const CALENDAR_URL = 'SET THIS YOURSELF'; // e.g., 'https://calendar.google.com/calendar/ical/your_calendar.ics'

  try {
    https.get(CALENDAR_URL, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        const events = parseICS(data);
        res.json(events);
      });
    }).on('error', (error) => {
      console.error('Error fetching calendar:', error);
      res.status(500).json({ error: 'Failed to fetch calendar' });
    });
  } catch (error) {
    console.error('Error fetching calendar:', error);
    res.status(500).json({ error: 'Failed to fetch calendar' });
  }
});

// Simple ICS parser
function parseICS(icsData) {
  const events = [];
  const lines = icsData.split('\n');
  let currentEvent = null;
  
  for (let line of lines) {
    line = line.trim();
    
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.title = line.substring(8);
      } else if (line.startsWith('DTSTART')) {
        const dateStr = line.split(':')[1];
        currentEvent.start = parseDateString(dateStr);
      } else if (line.startsWith('DTEND')) {
        const dateStr = line.split(':')[1];
        currentEvent.end = parseDateString(dateStr);
      } else if (line.startsWith('DESCRIPTION:')) {
        currentEvent.description = line.substring(12);
      } else if (line.startsWith('LOCATION:')) {
        currentEvent.location = line.substring(9);
      }
    }
  }
  
  const now = new Date();
  return events
    .filter(e => e.start && new Date(e.start) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 10);
}

function parseDateString(dateStr) {
  if (dateStr.length >= 15) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);
  }
  return null;
}

// Tech News Endpoint
app.get('/api/news/tech', async (req, res) => {
  const RSS_FEEDS = [
    'https://hnrss.org/frontpage',
    'https://feeds.arstechnica.com/arstechnica/index'
  ];
  
  const tryFeed = (url) => {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const news = parseRSS(data);
            if (news.length > 0) {
              resolve(news);
            } else {
              reject(new Error('No news items parsed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.setTimeout(5000, () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  };

  for (const feed of RSS_FEEDS) {
    try {
      const news = await tryFeed(feed);
      return res.json(news.slice(0, 20));
    } catch (error) {
      console.error(`Failed to fetch from ${feed}:`, error.message);
      continue;
    }
  }
  
  console.error('All news feeds failed');
  res.json([
    { title: 'Tech news feed temporarily unavailable', link: '#' },
    { title: 'Please check back later for updates', link: '#' }
  ]);
});

// Improved RSS parser
function parseRSS(rssData) {
  const news = [];
  
  try {
    const itemRegex = /<item>(.*?)<\/item>/gs;
    const items = rssData.match(itemRegex);
    
    if (items) {
      items.forEach(item => {
        let titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
        let linkMatch = item.match(/<link>(.*?)<\/link>/);
        
        if (!linkMatch) {
          linkMatch = item.match(/<link[^>]*href=["']([^"']+)["']/);
        }
        
        if (titleMatch && linkMatch) {
          const title = titleMatch[1].trim().replace(/<!\[CDATA\[|\]\]>/g, '');
          const link = linkMatch[1].trim();
          
          if (title && link) {
            news.push({ title, link });
          }
        }
      });
    }
  } catch (e) {
    console.error('Error parsing RSS:', e);
  }
  
  return news;
}

// Messages Endpoints
app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY created_at ASC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching messages:', err);
      res.status(500).json({ error: 'Failed to fetch messages' });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/messages', (req, res) => {
  const { username, text, timestamp } = req.body;
  
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: 'Message text is required' });
  }
  
  const finalUsername = username || 'Anonymous';
  
  db.run(
    'INSERT INTO messages (username, text, timestamp) VALUES (?, ?, ?)',
    [finalUsername, text, timestamp],
    function(err) {
      if (err) {
        console.error('Error saving message:', err);
        res.status(500).json({ error: 'Failed to save message' });
      } else {
        res.json({
          id: this.lastID,
          username: finalUsername,
          text,
          timestamp
        });
      }
    }
  );
});

app.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM messages WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('Error deleting message:', err);
      res.status(500).json({ error: 'Failed to delete message' });
    } else {
      res.json({ success: true, deleted: this.changes });
    }
  });
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
    process.exit(0);
  });
});
