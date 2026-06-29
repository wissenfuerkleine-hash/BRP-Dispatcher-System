const { Client, GatewayIntentBits, Partials } = require('discord.js');
const threatEngine = require('../threat/threatEngine');
const AutoMod = require('../automod/automod');
const LockdownSystem = require('../systems/lockdown');
const SecurityLogger = require('../utils/logger');
const { initDatabase } = require('../database/db');
require('dotenv').config();

class SecurityBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites
      ],
      partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
    });

    this.automod = null;
    this.lockdown = null;
    this.logger = null;

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`Bot logged in as ${this.client.user.tag}`);
      
      // Initialize systems
      await initDatabase();
      
      this.automod = new AutoMod(this.client);
      this.lockdown = new LockdownSystem(this.client);
      this.logger = new SecurityLogger(this.client);
      await this.logger.init();

      console.log('Security systems initialized');
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      // AutoMod check
      const result = await this.automod.checkMessage(message);
      
      if (result) {
        await this.logger.logThreatScore(message.author.id, result.score, result.threshold);
        
        // Check if we need to trigger lockdown
        if (result.threshold === 'LOCKDOWN') {
          const level = result.score >= 90 ? 3 : result.score >= 60 ? 2 : 1;
          await this.lockdown.initiateLockdown(level, `High threat score: ${result.score}`, 'AUTO', 'AUTO');
          await this.logger.logLockdown(level, `High threat score: ${result.score}`, 'AUTO');
        } else if (result.threshold === 'FAIL_ALERT') {
          await this.logger.logFailAlert(message.author.id, result.score, result.tier);
        }
      }
    });

    this.client.on('guildMemberAdd', async (member) => {
      // Raid detection - if many joins in short time
      const now = Date.now();
      if (!this.joinHistory) this.joinHistory = [];
      
      this.joinHistory.push(now);
      this.joinHistory = this.joinHistory.filter(t => now - t <= 10000); // Last 10 seconds
      
      if (this.joinHistory.length >= 10) {
        await this.lockdown.initiateLockdown(3, 'Raid detected - rapid member joins', 'AUTO', 'AUTO');
        await this.logger.logLockdown(3, 'Raid detected', 'AUTO');
      }
    });

    this.client.on('channelDelete', async (channel) => {
      const result = await threatEngine.addThreat(
        'UNKNOWN',
        channel.guild.id,
        'channel_delete',
        channel.guild.members.me
      );
      
      await this.logger.log('CHANNEL_DELETE', 'UNKNOWN', { channelId: channel.id, name: channel.name });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(3, 'Channel sabotage detected', 'AUTO', 'AUTO');
        await this.logger.logLockdown(3, 'Channel sabotage', 'AUTO');
      }
    });

    this.client.on('roleDelete', async (role) => {
      const result = await threatEngine.addThreat(
        'UNKNOWN',
        role.guild.id,
        'role_delete',
        role.guild.members.me
      );
      
      await this.logger.log('ROLE_DELETE', 'UNKNOWN', { roleId: role.id, name: role.name });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(3, 'Role sabotage detected', 'AUTO', 'AUTO');
        await this.logger.logLockdown(3, 'Role sabotage', 'AUTO');
      }
    });

    this.client.on('inviteCreate', async (invite) => {
      const result = await threatEngine.addThreat(
        invite.inviterId,
        invite.guild.id,
        'invite_spam',
        invite.guild.members.me
      );
      
      await this.logger.log('INVITE_CREATE', invite.inviterId, { code: invite.code });
      
      if (result.threshold === 'LOCKDOWN') {
        await this.lockdown.initiateLockdown(2, 'Invite spam detected', 'AUTO', 'AUTO');
        await this.logger.logLockdown(2, 'Invite spam', 'AUTO');
      }
    });
  }

  start() {
    this.client.login(process.env.DISCORD_TOKEN);
  }

  getLockdownSystem() {
    return this.lockdown;
  }
}

module.exports = SecurityBot;
