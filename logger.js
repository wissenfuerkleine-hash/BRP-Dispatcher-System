const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { pool } = require('../database/db');
const incidentPanel = require('./incidentPanel');
const snapshot = require('./snapshot');
const permissions = require('./permissions');

class LockdownSystem {
  constructor(client) {
    this.client = client;
    this.activeLockdown = null;
    this.lockdownLevel = 0;
  }

  async initiateLockdown(level, reason, initiator = 'AUTO', mode = 'AUTO') {
    if (this.activeLockdown) {
      console.log('Lockdown already active');
      return null;
    }

    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const incidentId = `INC-${Date.now()}`;

    // Create snapshot before lockdown
    await snapshot.createSnapshot(guild, incidentId);

    this.activeLockdown = {
      id: incidentId,
      level,
      reason,
      initiator,
      mode,
      startTime: Date.now()
    };

    this.lockdownLevel = level;

    // Apply lockdown measures based on level
    await this.applyLockdownLevel(guild, level);

    // Create incident panel
    await incidentPanel.create(guild, incidentId, level, reason, initiator, mode);

    // Log to database
    await pool.query(
      `INSERT INTO incidents (incident_id, status, mode, level, reason, initiator, timeline, system_status)
       VALUES ($1, 'ACTIVE', $2, $3, $4, $5, $6, $7)`,
      [incidentId, mode, level, reason, initiator, JSON.stringify([]), JSON.stringify({ lockdown: true, level })]
    );

    return incidentId;
  }

  async applyLockdownLevel(guild, level) {
    switch (level) {
      case 1:
        await this.applyLevel1(guild);
        break;
      case 2:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        break;
      case 3:
        await this.applyLevel1(guild);
        await this.applyLevel2(guild);
        await this.applyLevel3(guild);
        break;
    }
  }

  async applyLevel1(guild) {
    // Close all text channels except mod/ticket
    const channels = guild.channels.cache.filter(c => c.isTextBased());
    const allowedChannels = ['mod', 'ticket', 'admin', 'staff'];

    for (const channel of channels) {
      const [_, ch] = channel;
      if (!allowedChannels.some(name => ch.name.toLowerCase().includes(name))) {
        await ch.permissionOverwrites.edit(guild.roles.everyone, {
          [PermissionFlagsBits.SendMessages]: false
        });
      }
    }
  }

  async applyLevel2(guild) {
    // Close voice channels and block screen share
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());

    for (const channel of voiceChannels) {
      const [_, ch] = channel;
      await ch.permissionOverwrites.edit(guild.roles.everyone, {
        [PermissionFlagsBits.Connect]: false,
        [PermissionFlagsBits.Stream]: false
      });
    }
  }

  async applyLevel3(guild) {
    // Delete and block invites
    const invites = await guild.invites.fetch();
    for (const invite of invites.values()) {
      await invite.delete('Lockdown Level 3');
    }

    // Enable permission freeze
    await permissions.freezePermissions(guild);
  }

  async getLockdownStatus() {
    return this.activeLockdown;
  }

  isActive() {
    return this.activeLockdown !== null;
  }
}

module.exports = LockdownSystem;
