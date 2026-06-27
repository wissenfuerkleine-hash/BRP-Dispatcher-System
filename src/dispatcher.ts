import {
  Client,
  Guild,
  GuildMember,
  VoiceChannel,
} from 'discord.js';
import {
  WAITING_ROOM_ID,
  SUPPORTER_ROLE_ID,
  SUPPORT_ROOM_IDS,
  DISPATCH_DELAY_MS,
} from './config.js';
import { waitingQueue, activeSessions, pendingDispatch, SupportSession } from './state.js';
import { sendLog } from './logger.js';

interface AvailableSlot {
  room: VoiceChannel;
  supporter: GuildMember;
}

function findAvailableSlot(guild: Guild): AvailableSlot | 'busy' | 'offline' {
  let anyOnline = false;

  for (const roomId of SUPPORT_ROOM_IDS) {
    const channel = guild.channels.cache.get(roomId);
    if (!(channel instanceof VoiceChannel)) continue;

    const supporter = channel.members.find(m =>
      m.roles.cache.has(SUPPORTER_ROLE_ID),
    );
    if (!supporter) continue;

    anyOnline = true;

    if (activeSessions.has(roomId)) continue;

    const hasCitizen = channel.members.some(
      m => !m.roles.cache.has(SUPPORTER_ROLE_ID),
    );
    if (hasCitizen) continue;

    return { room: channel as VoiceChannel, supporter };
  }

  return anyOnline ? 'busy' : 'offline';
}

export async function lockRoom(room: VoiceChannel, guild: Guild): Promise<void> {
  const everyoneRole = guild.roles.everyone;
  await room.permissionOverwrites.edit(everyoneRole, { Connect: false });
  const supporterRole = guild.roles.cache.get(SUPPORTER_ROLE_ID);
  if (supporterRole) {
    await room.permissionOverwrites.edit(supporterRole, { Connect: true });
  }
}

export async function unlockRoom(room: VoiceChannel, guild: Guild): Promise<void> {
  const everyoneRole = guild.roles.everyone;
  await room.permissionOverwrites.edit(everyoneRole, { Connect: null });
  const supporterRole = guild.roles.cache.get(SUPPORTER_ROLE_ID);
  if (supporterRole) {
    await room.permissionOverwrites.delete(supporterRole);
  }
}

export async function processQueue(client: Client, guild: Guild): Promise<void> {
  if (waitingQueue.length === 0) return;

  const slot = findAvailableSlot(guild);

  if (slot === 'offline') {
    await sendLog(client, 'offline');
    return;
  }

  if (slot === 'busy') {
    await sendLog(client, 'busy');
    return;
  }

  const citizenId = waitingQueue[0];
  if (!citizenId) return;

  if (pendingDispatch.has(citizenId)) return;
  pendingDispatch.add(citizenId);

  const citizen = guild.members.cache.get(citizenId);
  if (!citizen) {
    waitingQueue.shift();
    pendingDispatch.delete(citizenId);
    await processQueue(client, guild);
    return;
  }

  console.log(`[Dispatcher] Dispatching ${citizen.user.tag} in ${DISPATCH_DELAY_MS / 1000}s to room ${slot.room.id}`);

  try {
    await slot.supporter.send(
      `📣 **Support-Einsatz in ${DISPATCH_DELAY_MS / 1000} Sekunden!**\n` +
      `👤 Bürger: **${citizen.user.tag}**\n` +
      `🔊 Raum: **${slot.room.name}**\n` +
      `Der Bürger wird gleich zu dir gemovt.`,
    );
  } catch {
    console.warn(`[Dispatcher] Konnte DM an Supporter ${slot.supporter.user.tag} nicht senden (DMs deaktiviert?)`);
  }

  setTimeout(async () => {
    try {
      const currentCitizen = guild.members.cache.get(citizenId);
      if (!currentCitizen || currentCitizen.voice.channelId !== WAITING_ROOM_ID) {
        waitingQueue.splice(waitingQueue.indexOf(citizenId), 1);
        pendingDispatch.delete(citizenId);
        return;
      }

      const currentSlot = findAvailableSlot(guild);
      if (currentSlot === 'busy' || currentSlot === 'offline') {
        pendingDispatch.delete(citizenId);
        await processQueue(client, guild);
        return;
      }

      const { room, supporter } = currentSlot;

      await currentCitizen.voice.setChannel(room);

      const session: SupportSession = {
        citizenId,
        supporterId: supporter.id,
        roomId: room.id,
        startedAt: new Date(),
      };
      activeSessions.set(room.id, session);

      await lockRoom(room, guild);

      waitingQueue.splice(waitingQueue.indexOf(citizenId), 1);
      pendingDispatch.delete(citizenId);

      await sendLog(
        client,
        'taken',
        `${currentCitizen.user.tag} → ${room.name} (Supporter: ${supporter.user.tag})`,
      );

      console.log(`[Dispatcher] Session gestartet: ${currentCitizen.user.tag} in Raum ${room.name}`);
    } catch (err) {
      console.error('[Dispatcher] Fehler beim Dispatch:', err);
      pendingDispatch.delete(citizenId);
    }
  }, DISPATCH_DELAY_MS);
}

export async function endSupport(
  client: Client,
  guild: Guild,
  roomId: string,
): Promise<void> {
  const session = activeSessions.get(roomId);
  if (!session) return;

  const room = guild.channels.cache.get(roomId);
  if (room instanceof VoiceChannel) {
    const citizen = guild.members.cache.get(session.citizenId);
    if (citizen?.voice.channelId === roomId) {
      try {
        await citizen.voice.disconnect();
      } catch (err) {
        console.error('[EndSupport] Konnte Bürger nicht disconnecten:', err);
      }
    }
    await unlockRoom(room, guild);
  }

  activeSessions.delete(roomId);

  await sendLog(client, 'ended', `Raum: ${room instanceof VoiceChannel ? room.name : roomId}`);

  console.log(`[Dispatcher] Session beendet in Raum ${roomId}`);

  await processQueue(client, guild);
}
