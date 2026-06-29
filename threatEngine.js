const { EmbedBuilder, ChannelType } = require('discord.js');
const { pool } = require('../database/db');

class IncidentPanel {
  constructor(client) {
    this.client = client;
    this.incidentChannel = null;
  }

  async create(guild, incidentId, level, reason, initiator, mode) {
    // Create or get incident category
    let category = guild.channels.cache.find(c => c.name === 'INCIDENTS' && c.type === ChannelType.GuildCategory);
    if (!category) {
      category = await guild.channels.create({
        name: 'INCIDENTS',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: ['ViewChannel']
          },
          {
            id: process.env.SECURITY_ROLE_ID,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });
    }

    // Create incident channel
    const channel = await guild.channels.create({
      name: `incident-${incidentId}`,
      type: ChannelType.GuildText,
      parent: category,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: ['ViewChannel']
        },
        {
          id: process.env.SECURITY_ROLE_ID,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
      ]
    });

    this.incidentChannel = channel;

    // Create initial embed
    const embed = this.createEmbed(incidentId, level, reason, initiator, mode);
    await channel.send({ embeds: [embed] });

    return channel;
  }

  createEmbed(incidentId, level, reason, initiator, mode) {
    const levelColors = {
      1: 0xFFFF00,
      2: 0xFFA500,
      3: 0xFF0000
    };

    return new EmbedBuilder()
      .setTitle(`🚨 INCIDENT: ${incidentId}`)
      .setColor(levelColors[level] || 0xFFFF00)
      .addFields(
        { name: 'Status', value: 'ACTIVE LOCKDOWN', inline: true },
        { name: 'Mode', value: mode, inline: true },
        { name: 'Level', value: level.toString(), inline: true },
        { name: 'Reason', value: reason, inline: false },
        { name: 'Threat Score', value: 'N/A', inline: true },
        { name: 'Initiator', value: initiator, inline: true },
        { name: 'System Status', value: 'LOCKDOWN ACTIVE', inline: true },
        { name: 'Recovery Status', value: 'PENDING', inline: true }
      )
      .setTimestamp();
  }

  async update(incidentId, updates) {
    if (!this.incidentChannel) return;

    const messages = await this.incidentChannel.messages.fetch();
    const lastMessage = messages.last();

    if (lastMessage && lastMessage.embeds.length > 0) {
      const embed = EmbedBuilder.from(lastMessage.embeds[0]);
      
      if (updates.threatScore) embed.data.fields.find(f => f.name === 'Threat Score').value = updates.threatScore;
      if (updates.status) embed.data.fields.find(f => f.name === 'Status').value = updates.status;
      if (updates.recovery) embed.data.fields.find(f => f.name === 'Recovery Status').value = updates.recovery;

      await lastMessage.edit({ embeds: [embed] });
    }

    // Update database
    await pool.query(
      `UPDATE SET system_status = COALESCE($2, system_status), recovery_status = COALESCE($3, recovery_status)
       WHERE incident_id = $1`,
      [incidentId, updates.systemStatus, updates.recovery]
    );
  }

  async addTimelineEvent(incidentId, event) {
    if (!this.incidentChannel) return;

    await this.incidentChannel.send(`📋 **Timeline Update**: ${event}`);

    // Update database
    const result = await pool.query('SELECT timeline FROM incidents WHERE incident_id = $1', [incidentId]);
    const timeline = result.rows[0]?.timeline || [];
    timeline.push({ event, timestamp: new Date().toISOString() });

    await pool.query('UPDATE incidents SET timeline = $2 WHERE incident_id = $1', [incidentId, JSON.stringify(timeline)]);
  }

  async close(incidentId) {
    if (!this.incidentChannel) return;

    await this.incidentChannel.send('✅ **INCIDENT RESOLVED** - Lockdown ended');
    await this.incidentChannel.send(`🔒 Channel will be archived in 1 hour.`);

    // Update database
    await pool.query('UPDATE incidents SET status = $1 WHERE incident_id = $2', ['RESOLVED', incidentId]);
  }
}

module.exports = new IncidentPanel();
