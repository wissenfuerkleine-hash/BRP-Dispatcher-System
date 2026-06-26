require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const queueSystem = require('./systems/queueSystem');
const audioSystem = require('./systems/audioSystem');
const dispatcher = require('./systems/dispatcherSystem');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember],
});

// Load commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

// Register slash commands
async function registerCommands() {
  const commands = client.commands.map((c) => c.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('[Bot] Slash commands registered.');
  } catch (err) {
    console.error('[Bot] Failed to register commands:', err.message);
  }
}

client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  await registerCommands();
});

// Voice state handler
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild;
  const member = newState.member;
  if (!member || member.user.bot) return;

  const joinedWaiting =
    newState.channelId === config.WAITING_ROOM_ID &&
    oldState.channelId !== config.WAITING_ROOM_ID;

  const leftWaiting =
    oldState.channelId === config.WAITING_ROOM_ID &&
    newState.channelId !== config.WAITING_ROOM_ID;

  // Left a support room mid-session
  const leftSupportRoom =
    config.SUPPORT_ROOM_IDS.includes(oldState.channelId) &&
    !config.SUPPORT_ROOM_IDS.includes(newState.channelId);

  if (joinedWaiting) {
    // Add to queue
    await queueSystem.add(member);
    console.log(`[Bot] ${member.user.username} joined waiting room.`);

    // Start waiting audio if not already playing
    const waitingChannel = guild.channels.cache.get(config.WAITING_ROOM_ID);
    if (waitingChannel && !audioSystem.isPlayingWaiting) {
      audioSystem.startWaiting(waitingChannel);
    }

    // Run dispatcher
    await dispatcher.dispatch(guild, member);
  }

  if (leftWaiting) {
    // Remove from queue if they left voluntarily
    const wasInQueue = await queueSystem.has(member.id);
    if (wasInQueue) {
      await queueSystem.remove(member.id);
      console.log(`[Bot] ${member.user.username} left waiting room — removed from queue.`);
    }

    // Stop music if nobody left
    const waitingChannel = guild.channels.cache.get(config.WAITING_ROOM_ID);
    if (waitingChannel && waitingChannel.members.filter((m) => !m.user.bot).size === 0) {
      audioSystem.stopWaiting();
    }
  }

  if (leftSupportRoom) {
    // If a Bürger leaves a locked support room unexpectedly, end the session
    const activeRooms = dispatcher.getActiveRooms();
    const session = activeRooms.get(oldState.channelId);
    if (session && session.citizenId === member.id && member.roles.cache.has(config.BUERGER_ROLE_ID)) {
      console.log(`[Bot] Citizen ${member.user.username} left support room — ending session.`);
      await dispatcher.endSupport(oldState.channelId, guild);
    }
  }
});

// Slash command handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Bot] Command error (${interaction.commandName}):`, err.message);
    const reply = { content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

module.exports = { client };
