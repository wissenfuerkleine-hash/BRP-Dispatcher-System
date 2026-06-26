const express = require('express');
const router = express.Router();
const queueSystem = require('../systems/queueSystem');
const dispatcher = require('../systems/dispatcherSystem');
const Session = require('../models/Session');
const Stats = require('../models/Stats');
const Settings = require('../models/Settings');
const config = require('../config');
const { requireSecret } = require('../middlewares/auth');

// Read-only endpoints — no auth required
// GET /api/queue
router.get('/queue', async (req, res) => {
  const queue = await queueSystem.getAll();
  const now = Date.now();
  const withWait = queue.map((q) => ({
    ...q,
    waitMs: now - new Date(q.joinedAt).getTime(),
  }));
  res.json(withWait);
});

// GET /api/rooms
router.get('/rooms', (req, res) => {
  res.json(dispatcher.getRoomStatuses());
});

// Write endpoints — require DASHBOARD_SECRET token
// POST /api/rooms/:roomId/end
router.post('/rooms/:roomId/end', requireSecret, async (req, res) => {
  const { roomId } = req.params;
  const { client } = require('../bot');
  const guild = client.guilds.cache.first();
  if (!guild) return res.status(500).json({ error: 'Guild not found' });

  const result = await dispatcher.endSupport(roomId, guild);
  if (result) {
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'No active session in that room' });
  }
});

// POST /api/queue/clear
router.post('/queue/clear', requireSecret, async (req, res) => {
  await queueSystem.clear();
  res.json({ ok: true });
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  const totalSessions = await Session.countDocuments();
  const sessions = await Session.find({ waitTime: { $gt: 0 } }).lean();
  const avgWait =
    sessions.length > 0
      ? sessions.reduce((a, b) => a + b.waitTime, 0) / sessions.length
      : 0;
  const ranking = await Stats.find().sort({ totalSessions: -1 }).lean();
  res.json({ totalSessions, avgWaitMs: avgWait, ranking });
});

// GET /api/settings
router.get('/settings', async (req, res) => {
  const delay = await Settings.get('dispatchDelay', config.DISPATCH_DELAY);
  res.json({ dispatchDelay: delay });
});

// POST /api/settings
router.post('/settings', requireSecret, express.json(), async (req, res) => {
  const { dispatchDelay } = req.body;
  if (dispatchDelay !== undefined) {
    const val = Math.max(1000, Math.min(60000, Number(dispatchDelay)));
    await Settings.set('dispatchDelay', val);
  }
  res.json({ ok: true });
});

// POST /api/channel-reset/:channelId
router.post('/channel-reset/:channelId', requireSecret, async (req, res) => {
  const { channelId } = req.params;
  const { client } = require('../bot');
  const guild = client.guilds.cache.first();
  if (!guild) return res.status(500).json({ error: 'Guild not found' });

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  try {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: null });
    dispatcher.getActiveRooms().delete(channelId);
    // Notify Socket.io clients so the dashboard updates immediately
    const io = req.app.get('io');
    if (io) io.emit('roomsUpdate', dispatcher.getRoomStatuses());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
