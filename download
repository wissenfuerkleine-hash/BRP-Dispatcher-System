const { pool } = require('../database/db');
const permissions = require('./permissions');
const incidentPanel = require('./incidentPanel');

class RestoreManager {
  constructor(client) {
    this.client = client;
  }

  async restoreFromSnapshot(incidentId) {
    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const snapshot = await pool.query('SELECT * FROM snapshots WHERE incident_id = $1', [incidentId]);

    if (snapshot.rows.length === 0) {
      console.log('No snapshot found for incident', incidentId);
      return false;
    }

    const data = snapshot.rows[0];

    // Restore permissions first
    await permissions.restorePermissions(guild);

    // Restore channel permissions
    for (const channelData of data.channels) {
      const channel = await guild.channels.fetch(channelData.id).catch(() => null);
      if (channel) {
        for (const overwrite of channelData.permissionOverwrites) {
          await channel.permissionOverwrites.create(overwrite.id, {
            allow: overwrite.allow,
            deny: overwrite.deny
          }).catch(() => {});
        }
      }
    }

    // Restore role permissions
    for (const roleData of data.roles) {
      const role = await guild.roles.fetch(roleData.id).catch(() => null);
      if (role) {
        await role.setPermissions(roleData.permissions);
        await role.setPosition(roleData.position);
      }
    }

    // Close incident panel
    await incidentPanel.close(incidentId);

    console.log(`Restore completed for incident ${incidentId}`);
    return true;
  }
}

module.exports = RestoreManager;
