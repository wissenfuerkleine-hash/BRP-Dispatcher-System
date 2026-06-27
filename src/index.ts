import {
  Client,
  GatewayIntentBits,
  VoiceState,
  Interaction,
  ChatInputCommandInteraction,
  VoiceChannel,
  Guild,
} from 'discord.js';
import {
  WAITING_ROOM_ID,
  PING_CHANNEL_ID,
  SUPPORTER_ROLE_ID,
  SUPPORT_ROOM_IDS,
} from './config.js';
import { waitingQueue, activeSessions, pendingDispatch } from './state.js';
import { processQueue, endSupport } from './dispatcher.js';
import { sendLog } from './logger.js';
import { startWaitingMusic, stopWaitingMusic } from './audio.js';
import { registerCommands } from './commands/register.js';
import { execute as executeEndsupport } from './commands/endsupport.js';
import * as http from 'http'; // Für den Health-Check-Server importiert

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[Bot] DISCORD_TOKEN ist nicht gesetzt. Bot wird beendet.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('clientReady', async () => {
  console.log(`[Bot] Eingeloggt als ${client.user?.tag}`);

  if (!client.user) return;
  await registerCommands(client.user.id, token as string);

  console.log(`[Bot] Watching:`);
  console.log(`  Warteraum:    ${WAITING_ROOM_ID}`);
  console.log(`  Ping Channel: ${PING_CHANNEL_ID}`);
  console.log(`  Support Räume: ${SUPPORT_ROOM_IDS.join(', ')}`);
});

client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
  const guild = newState.guild ?? oldState.guild;
  const memberId = newState.member?.id ?? oldState.member?.id;
  if (!memberId) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  const member = newState.member ?? oldState.member;
  if (member?.user.bot) return;

  const isSupporter = member?.roles.cache.has(SUPPORTER_ROLE_ID) ?? false;

  const joinedWaiting = newChannelId === WAITING_ROOM_ID && oldChannelId !== WAITING_ROOM_ID;
  const leftWaiting = oldChannelId === WAITING_ROOM_ID && newChannelId !== WAITING_ROOM_ID;
  const leftSupportRoom = oldChannelId !== null && SUPPORT_ROOM_IDS.includes(oldChannelId) && newChannelId !== oldChannelId;
  const joinedSupportRoom = newChannelId !== null && SUPPORT_ROOM_IDS.includes(newChannelId) && oldChannelId !== newChannelId;

  if (joinedSupportRoom && isSupporter && waitingQueue.length > 0) {
    console.log(`[Queue] Supporter ${member?.user.tag} hat Support-Raum betreten — prüfe Queue (${waitingQueue.length} wartend)`);
    await processQueue(client, guild);
    return;
  }

  if (joinedWaiting) {
    if (!member) return;

    if (!waitingQueue.includes(memberId)) {
      waitingQueue.push(memberId);
      console.log(`[Queue] ${member.user.tag} ist dem Warteraum beigetreten. Queue-Länge: ${waitingQueue.length}`);
      await sendLog(client, 'waiting', member.user.tag);
    }

    const waitingChannel = guild.channels.cache.get(WAITING_ROOM_ID);
    if (waitingChannel?.isVoiceBased()) {
      await startWaitingMusic(waitingChannel);
    }

    await processQueue(client, guild);
    return;
  }

  if (leftWaiting) {
    const idx = waitingQueue.indexOf(memberId);
    if (idx !== -1) {
      waitingQueue.splice(idx, 1);
      pendingDispatch.delete(memberId);
      console.log(`[Queue] Benutzer ${memberId} hat den Warteraum verlassen. Queue-Länge: ${waitingQueue.length}`);
    }

    if (waitingQueue.length === 0 && pendingDispatch.size === 0) {
      stopWaitingMusic(guild.id);
    }
    return;
  }

  if (leftSupportRoom && oldChannelId) {
    const session = activeSessions.get(oldChannelId);
    if (!session) return;

    const isCitizenLeaving = session.citizenId === memberId;
    const isSupporterLeaving = session.supporterId === memberId;

    if (isCitizenLeaving || isSupporterLeaving) {
      console.log(`[Session] ${isCitizenLeaving ? 'Bürger' : 'Supporter'} hat Support-Raum ${oldChannelId} verlassen — Session wird beendet`);
      await endSupport(client, guild, oldChannelId);
    }
  }
});

client.on('interactionCreate', async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction as ChatInputCommandInteraction;

  if (cmd.commandName === 'endsupport') {
    await executeEndsupport(cmd, client);
  }
});

client.on('error', (err) => {
  console.error('[Bot] Client-Fehler:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[Bot] Unbehandelte Promise-Ablehnung:', err);
});

client.login(token);

// ==========================================
// RAILWAY HEALTH-CHECK SERVER (PORT 3000)
// ==========================================
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Health-Check] Server läuft auf Port ${PORT}`);
});
