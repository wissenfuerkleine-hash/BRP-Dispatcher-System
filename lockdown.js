const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { pool } = require('../database/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'discord-security-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Store lockdown system reference (will be set by main bot)
let lockdownSystem = null;
let restoreManager = null;

app.setLockdownSystem = (system) => {
  lockdownSystem = system;
};

app.setRestoreManager = (manager) => {
  restoreManager = manager;
};

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Routes
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Security Dashboard - Login</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #1a1a2e;
          color: #eee;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .login-box {
          background: #16213e;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
          width: 300px;
        }
        h2 { text-align: center; color: #e94560; }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: none;
          border-radius: 5px;
          background: #0f3460;
          color: #eee;
        }
        button {
          width: 100%;
          padding: 10px;
          background: #e94560;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover { background: #c73e54; }
        .error { color: #ff6b6b; text-align: center; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h2>🔒 Security Dashboard</h2>
        <form method="POST" action="/login">
          <input type="password" name="password" placeholder="Enter password" required>
          <button type="submit">Login</button>
        </form>
        ${req.session.error ? '<div class="error">' + req.session.error + '</div>' : ''}
      </div>
    </body>
    </html>
  `);
});

app.post('/login', async (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    req.session.error = null;
    res.redirect('/dashboard');
  } else {
    req.session.error = 'Invalid password';
    res.redirect('/login');
  }
});

app.get('/logout', (req, res) => {
  req.session.authenticated = false;
  res.redirect('/login');
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const lockdownStatus = lockdownSystem ? lockdownSystem.getLockdownStatus() : null;
  
  // Get recent incidents
  const incidentsResult = await pool.query(
    'SELECT * FROM incidents ORDER BY created_at DESC LIMIT 10'
  );
  
  // Get recent logs
  const logsResult = await pool.query(
    'SELECT * FROM security_logs ORDER BY created_at DESC LIMIT 20'
  );

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Security Dashboard</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #1a1a2e;
          color: #eee;
          margin: 0;
          padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
        }
        .status-box {
          background: #16213e;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .status-active { border-left: 5px solid #e94560; }
        .status-inactive { border-left: 5px solid #00ff88; }
        .panic-btn {
          background: #ff0000;
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
        }
        .panic-btn:hover { background: #cc0000; }
        .unlock-btn {
          background: #00ff88;
          color: #1a1a2e;
          border: none;
          padding: 15px 30px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
        }
        .unlock-btn:hover { background: #00cc6a; }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #0f3460;
        }
        th { background: #0f3460; }
        .level-1 { color: #ffff00; }
        .level-2 { color: #ffa500; }
        .level-3 { color: #ff0000; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔒 Security Dashboard</h1>
          <a href="/logout" style="color: #e94560; text-decoration: none;">Logout</a>
        </div>

        <div class="status-box ${lockdownStatus && lockdownSystem.isActive() ? 'status-active' : 'status-inactive'}">
          <h2>Lockdown Status</h2>
          ${lockdownStatus && lockdownSystem.isActive() ? `
            <p><strong>Status:</strong> ACTIVE</p>
            <p><strong>Incident ID:</strong> ${lockdownStatus.id}</p>
            <p><strong>Level:</strong> <span class="level-${lockdownStatus.level}">${lockdownStatus.level}</span></p>
            <p><strong>Reason:</strong> ${lockdownStatus.reason}</p>
            <p><strong>Initiator:</strong> ${lockdownStatus.initiator}</p>
            <p><strong>Mode:</strong> ${lockdownStatus.mode}</p>
            <br>
            <button class="unlock-btn" onclick="unlockServer()">🔓 UNLOCK SERVER</button>
          ` : `
            <p><strong>Status:</strong> NORMAL</p>
            <p>No active lockdown</p>
            <br>
            <button class="panic-btn" onclick="panicMode()">🚨 PANIC MODE</button>
          `}
        </div>

        <div class="status-box">
          <h2>Recent Incidents</h2>
          <table>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Level</th>
              <th>Reason</th>
              <th>Created</th>
            </tr>
            ${incidentsResult.rows.map(inc => `
              <tr>
                <td><a href="/incident/${inc.incident_id}">${inc.incident_id}</a></td>
                <td>${inc.status}</td>
                <td class="level-${inc.level}">${inc.level}</td>
                <td>${inc.reason}</td>
                <td>${new Date(inc.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        <div class="status-box">
          <h2>Security Logs</h2>
          <table>
            <tr>
              <th>Event Type</th>
              <th>User ID</th>
              <th>Timestamp</th>
            </tr>
            ${logsResult.rows.map(log => `
              <tr>
                <td>${log.event_type}</td>
                <td>${log.user_id || 'N/A'}</td>
                <td>${new Date(log.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      </div>

      <script>
        function panicMode() {
          if (confirm('Are you sure you want to trigger PANIC MODE? This will immediately activate Level 3 Lockdown!')) {
            fetch('/panic', { method: 'POST' })
              .then(() => location.reload());
          }
        }

        function unlockServer() {
          if (confirm('Are you sure you want to UNLOCK the server? This will restore all permissions and end the lockdown.')) {
            fetch('/unlock', { method: 'POST' })
              .then(() => location.reload());
          }
        }
      </script>
    </body>
    </html>
  `);
});

app.get('/incident/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM incidents WHERE incident_id = $1', [id]);
  
  if (result.rows.length === 0) {
    return res.send('Incident not found');
  }

  const incident = result.rows[0];

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Incident ${id}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #1a1a2e;
          color: #eee;
          margin: 0;
          padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .back-link { color: #e94560; text-decoration: none; margin-bottom: 20px; display: block; }
        .incident-box {
          background: #16213e;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        .timeline-item {
          background: #0f3460;
          padding: 10px;
          margin: 10px 0;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <a href="/dashboard" class="back-link">← Back to Dashboard</a>
        
        <div class="incident-box">
          <h1>Incident ${incident.incident_id}</h1>
          <p><strong>Status:</strong> ${incident.status}</p>
          <p><strong>Mode:</strong> ${incident.mode}</p>
          <p><strong>Level:</strong> ${incident.level}</p>
          <p><strong>Reason:</strong> ${incident.reason}</p>
          <p><strong>Initiator:</strong> ${incident.initiator}</p>
          <p><strong>Threat Score:</strong> ${incident.threat_score}</p>
          <p><strong>Role Tier Impact:</strong> ${incident.role_tier_impact}</p>
          <p><strong>Created:</strong> ${new Date(incident.created_at).toLocaleString()}</p>
        </div>

        <div class="incident-box">
          <h2>Timeline</h2>
          ${(incident.timeline || []).map(item => `
            <div class="timeline-item">
              <p><strong>${item.event}</strong></p>
              <p>${new Date(item.timestamp).toLocaleString()}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post('/panic', requireAuth, async (req, res) => {
  if (!lockdownSystem) {
    return res.status(500).json({ error: 'Lockdown system not available' });
  }

  const incidentId = await lockdownSystem.initiateLockdown(3, 'PANIC MODE triggered from Dashboard', 'DASHBOARD', 'MANUAL');
  res.json({ success: true, incidentId });
});

app.post('/unlock', requireAuth, async (req, res) => {
  if (!lockdownSystem || !restoreManager) {
    return res.status(500).json({ error: 'Systems not available' });
  }

  const status = lockdownSystem.getLockdownStatus();
  if (!status) {
    return res.json({ success: true, message: 'No active lockdown' });
  }

  await restoreManager.restoreFromSnapshot(status.id);
  lockdownSystem.activeLockdown = null;
  lockdownSystem.lockdownLevel = 0;

  res.json({ success: true, incidentId: status.id });
});

module.exports = app;
