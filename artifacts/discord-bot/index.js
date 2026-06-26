require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');
const queueSystem = require('./systems/queueSystem');
const dispatcher = require('./systems/dispatcherSystem');
const apiRouter = require('./routes/api');
const uploadRouter = require('./routes/upload');

async function main() {
  // ── MongoDB ──
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/support-bot');
  console.log('[Main] MongoDB connected.');

  // ── Express + HTTP server ──
  const app = express();
  const server = http.createServer(app);

  // ── Socket.io ──
  const io = new Server(server, { cors: { origin: '*' } });

  // Wire socket.io into systems BEFORE bot loads
  queueSystem.setIO(io);

  // ── Discord bot (requires queueSystem already configured) ──
  const { client } = require('./bot');
  dispatcher.init(client, io);

  // ── Express config ──
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Expose io to route handlers via app.get('io')
  app.set('io', io);

  app.use('/api', apiRouter);
  app.use('/upload', uploadRouter);

  app.get('/', async (req, res) => {
    try {
      const queue = await queueSystem.getAll();
      const rooms = dispatcher.getRoomStatuses();
      const guild = client.guilds.cache.first();

      const enrichedRooms = rooms.map((r) => {
        const session = r.active;
        const channel = guild ? guild.channels.cache.get(r.roomId) : null;
        return {
          ...r,
          channelName: channel ? channel.name : `Raum ${config.SUPPORT_ROOM_IDS.indexOf(r.roomId) + 1}`,
          session: session
            ? { ...session, runtimeMs: Date.now() - new Date(session.startedAt).getTime() }
            : null,
        };
      });

      const now = Date.now();
      const enrichedQueue = queue.map((q) => ({
        ...q,
        waitMs: now - new Date(q.joinedAt).getTime(),
      }));

      res.render('index', { queue: enrichedQueue, rooms: enrichedRooms, title: 'Support Dispatcher' });
    } catch (err) {
      console.error('[Dashboard] render error:', err);
      res.status(500).send('Dashboard error: ' + err.message);
    }
  });

  // ── Socket.io: send initial state on connect ──
  io.on('connection', async (socket) => {
    const queue = await queueSystem.getAll();
    const now = Date.now();
    socket.emit('queueUpdate', queue.map((q) => ({ ...q, waitMs: now - new Date(q.joinedAt).getTime() })));
    socket.emit('roomsUpdate', dispatcher.getRoomStatuses());
  });

  // ── Start HTTP server ──
  server.listen(config.DASHBOARD_PORT, () => {
    console.log(`[Main] Dashboard running on port ${config.DASHBOARD_PORT}`);
  });

  // ── Login Discord bot ──
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
