const config = require('../config');
const queueSystem = require('./queueSystem');
const audioSystem = require('./audioSystem');
const Session = require('../models/Session');
const Stats = require('../models/Stats');
const Settings = require('../models/Settings');

// roomId -> { supporterId, citizenId, startedAt, waitTime }
const activeRooms = new Map();

let _client = null;
let _io = null;

function init(client, io) {
  _client = client;
  _io = io;
}

function emitRooms() {
  if (_io) _io.emit('roomsUpdate', getRoomStatuses());
}

function getRoomStatuses() {
  return config.SUPPORT_ROOM_IDS.map((id) => {
    const active = activeRooms.get(id) || null;
    return { roomId: id, active };
  });
}

async function getDispatchDelay() {
  const delay = await Settings.get('dispatchDelay', config.DISPATCH_DELAY);
  return Number(delay);
}

function findAvailableSupporterRoom(guild) {
  for (const roomId of config.SUPPORT_ROOM_IDS) {
    if (activeRooms.has(roomId)) continue;

    const channel = guild.channels.cache.get(roomId);
    if (!channel) continue;

    const supporter = channel.members.find((m) =>
      m.roles.cache.has(config.SUPPORTER_ROLE_ID)
    );
    if (!supporter) continue;

    // Ensure no Bürger is already in this room
    const citizens = channel.members.filter(
      (m) => m.roles.cache.has(config.BUERGER_ROLE_ID) && !m.user.bot
    );
    if (citizens.size > 0) continue;

    return { channel, supporter };
  }
  return null;
}

function hasSupporterOnline(guild) {
  for (const roomId of config.SUPPORT_ROOM_IDS) {
    const channel = guild.channels.cache.get(roomId);
    if (!channel) continue;
    const supporter = channel.members.find((m) =>
      m.roles.cache.has(config.SUPPORTER_ROLE_ID)
    );
    if (supporter) return true;
  }
  return false;
}

async function sendLog(guild, emoji, text) {
  try {
    const channel = guild.channels.cache.get(config.PING_CHANNEL_ID);
    if (channel) await channel.send(`${emoji} **${text}**`);
  } catch (err) {
    console.error('[Dispatcher] sendLog error:', err.message);
  }
}

async function dispatch(guild, member) {
  const waitingChannel = guild.channels.cache.get(config.WAITING_ROOM_ID);

  // Check if member is still in waiting room
  if (!member.voice.channelId || member.voice.channelId !== config.WAITING_ROOM_ID) {
    await queueSystem.remove(member.id);
    return;
  }

  const availableRoom = findAvailableSupporterRoom(guild);

  if (availableRoom) {
    const { channel: supportRoom, supporter } = availableRoom;
    const delay = await getDispatchDelay();

    await sendLog(guild, '🟡', `Wartend — ${member.user.username}`);

    setTimeout(async () => {
      // Re-verify member is still waiting
      await guild.members.fetch(member.id).catch(() => null);
      if (!member.voice.channelId || member.voice.channelId !== config.WAITING_ROOM_ID) {
        await queueSystem.remove(member.id);
        return;
      }

      // Re-verify room is still free
      if (activeRooms.has(supportRoom.id)) {
        await dispatch(guild, member);
        return;
      }

      try {
        // Get queue entry for wait time
        const queueEntries = await queueSystem.getAll();
        const entry = queueEntries.find((q) => q.userId === member.id);
        const waitTime = entry ? Date.now() - new Date(entry.joinedAt).getTime() : 0;

        // Move citizen
        await member.voice.setChannel(supportRoom);

        // Lock the room (max 1 user limit trick via permissions)
        await supportRoom.permissionOverwrites.edit(guild.roles.everyone, {
          Connect: false,
        });

        // Record active session
        const sessionData = {
          roomId: supportRoom.id,
          supporterId: supporter.id,
          supporterName: supporter.user.username,
          citizenId: member.id,
          citizenName: member.user.username,
          waitTime,
          startedAt: new Date(),
          active: true,
        };
        activeRooms.set(supportRoom.id, sessionData);

        const session = await Session.create(sessionData);

        // Update supporter stats
        await Stats.findOneAndUpdate(
          { supporterId: supporter.id },
          {
            supporterName: supporter.user.username,
            $inc: { totalSessions: 1 },
            lastActive: new Date(),
          },
          { upsert: true }
        );

        // Remove from queue
        await queueSystem.remove(member.id);

        await sendLog(guild, '🟢', `Übernommen — ${member.user.username} → ${supporter.user.username}`);
        emitRooms();

        // Stop waiting music if queue is empty
        const count = await queueSystem.count();
        if (count === 0) audioSystem.stopWaiting();
      } catch (err) {
        console.error('[Dispatcher] move error:', err.message);
      }
    }, delay);

  } else if (hasSupporterOnline(guild)) {
    // Supporters exist but all rooms busy
    await sendLog(guild, '🟠', `Alle besetzt — ${member.user.username} wartet`);
    if (waitingChannel) await audioSystem.playInChannel(waitingChannel, 'busy.mp3');
  } else {
    // No supporter online
    await sendLog(guild, '⚫', `Niemand online — ${member.user.username} wartet`);
    if (waitingChannel) await audioSystem.playInChannel(waitingChannel, 'offline.mp3');
  }
}

async function endSupport(roomId, guild) {
  const session = activeRooms.get(roomId);
  if (!session) return null;

  try {
    const channel = guild.channels.cache.get(roomId);

    // Disconnect citizen
    if (session.citizenId) {
      const citizen = guild.members.cache.get(session.citizenId) ||
        await guild.members.fetch(session.citizenId).catch(() => null);
      if (citizen?.voice?.channelId === roomId) {
        await citizen.voice.disconnect().catch(() => {});
      }
    }

    // Unlock room
    if (channel) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        Connect: null,
      });
    }

    // Mark session done
    const duration = Date.now() - new Date(session.startedAt).getTime();
    await Session.findOneAndUpdate(
      { roomId, supporterId: session.supporterId, active: true },
      { endedAt: new Date(), active: false }
    );

    // Update supporter total time
    await Stats.findOneAndUpdate(
      { supporterId: session.supporterId },
      { $inc: { totalTime: duration }, lastActive: new Date() }
    );

    activeRooms.delete(roomId);
    await sendLog(guild, '🔴', `Beendet — ${session.citizenName} (${Math.round(duration / 1000)}s)`);
    emitRooms();

    // Check queue for next user
    const next = await queueSystem.getNext();
    if (next) {
      const nextMember = guild.members.cache.get(next.userId) ||
        await guild.members.fetch(next.userId).catch(() => null);
      if (nextMember) await dispatch(guild, nextMember);
    }

    return session;
  } catch (err) {
    console.error('[Dispatcher] endSupport error:', err.message);
    return null;
  }
}

function getActiveRooms() {
  return activeRooms;
}

module.exports = { init, dispatch, endSupport, getRoomStatuses, getActiveRooms, sendLog };
