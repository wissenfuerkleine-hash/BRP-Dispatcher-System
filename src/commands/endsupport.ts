import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  VoiceChannel,
  Guild,
  Client,
} from 'discord.js';
import { SUPPORTER_ROLE_ID, SUPPORT_ROOM_IDS } from '../config.js';
import { activeSessions } from '../state.js';
import { endSupport } from '../dispatcher.js';

export const data = new SlashCommandBuilder()
  .setName('endsupport')
  .setDescription('Beendet den aktiven Support-Fall im aktuellen Raum');

export async function execute(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  const member = await interaction.guild?.members.fetch(interaction.user.id);

  if (!member || !member.roles.cache.has(SUPPORTER_ROLE_ID)) {
    await interaction.reply({
      content: '❌ Nur Supporter dürfen diesen Command verwenden.',
      ephemeral: true,
    });
    return;
  }

  const voiceChannelId = member.voice.channelId;

  if (!voiceChannelId || !SUPPORT_ROOM_IDS.includes(voiceChannelId)) {
    await interaction.reply({
      content: '❌ Du befindest dich in keinem Support-Raum.',
      ephemeral: true,
    });
    return;
  }

  if (!activeSessions.has(voiceChannelId)) {
    await interaction.reply({
      content: '❌ In diesem Raum läuft kein aktiver Support-Fall.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild as Guild;
  await endSupport(client, guild, voiceChannelId);

  await interaction.editReply('✅ Support-Fall wurde beendet und Raum entsperrt.');
}
