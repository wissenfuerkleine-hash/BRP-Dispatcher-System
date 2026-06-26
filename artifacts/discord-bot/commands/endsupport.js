const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const dispatcher = require('../systems/dispatcherSystem');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('endsupport')
    .setDescription('Beende den aktuellen Support-Fall in deinem Voice Channel'),

  async execute(interaction) {
    const member = interaction.member;

    // Check supporter role
    if (!member.roles.cache.has(config.SUPPORTER_ROLE_ID)) {
      return interaction.reply({
        content: '❌ Du hast keine Berechtigung diesen Befehl zu nutzen.',
        ephemeral: true,
      });
    }

    // Find which support room the supporter is in
    const roomId = member.voice.channelId;
    if (!roomId || !config.SUPPORT_ROOM_IDS.includes(roomId)) {
      return interaction.reply({
        content: '❌ Du bist in keinem Support-Raum.',
        ephemeral: true,
      });
    }

    const activeRooms = dispatcher.getActiveRooms();
    if (!activeRooms.has(roomId)) {
      return interaction.reply({
        content: '❌ In diesem Raum ist kein aktiver Support.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const result = await dispatcher.endSupport(roomId, interaction.guild);
    if (result) {
      await interaction.editReply({ content: '✅ Support erfolgreich beendet.' });
    } else {
      await interaction.editReply({ content: '⚠️ Fehler beim Beenden des Supports.' });
    }
  },
};
