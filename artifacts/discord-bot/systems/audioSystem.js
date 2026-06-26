const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const config = require('../config');

class AudioSystem {
  constructor() {
    this.waitingPlayer = null;
    this.waitingConnection = null;
    this.isPlayingWaiting = false;
  }

  _audioPath(file) {
    return path.join(__dirname, '..', config.AUDIO_PATH, file);
  }

  async playInChannel(channel, file) {
    const filePath = this._audioPath(file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[AudioSystem] File not found: ${filePath}`);
      return;
    }

    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

      const player = createAudioPlayer();
      const resource = createAudioResource(filePath);
      connection.subscribe(player);
      player.play(resource);

      return new Promise((resolve) => {
        player.on(AudioPlayerStatus.Idle, () => {
          connection.destroy();
          resolve();
        });
        player.on('error', (err) => {
          console.error('[AudioSystem] Player error:', err.message);
          connection.destroy();
          resolve();
        });
      });
    } catch (err) {
      console.error('[AudioSystem] playInChannel error:', err.message);
    }
  }

  async startWaiting(channel) {
    if (this.isPlayingWaiting) return;

    const filePath = this._audioPath('waiting.mp3');
    if (!fs.existsSync(filePath)) {
      console.warn('[AudioSystem] waiting.mp3 not found — skipping waiting loop.');
      return;
    }

    // Set flag only after confirming the file exists
    this.isPlayingWaiting = true;

    try {
      this.waitingConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      await entersState(this.waitingConnection, VoiceConnectionStatus.Ready, 5_000);

      this.waitingPlayer = createAudioPlayer();
      this.waitingConnection.subscribe(this.waitingPlayer);
      this._loopWaiting(filePath);
    } catch (err) {
      console.error('[AudioSystem] startWaiting error:', err.message);
      this.isPlayingWaiting = false;
    }
  }

  _loopWaiting(filePath) {
    if (!this.isPlayingWaiting || !this.waitingPlayer) return;
    const resource = createAudioResource(filePath);
    this.waitingPlayer.play(resource);
    this.waitingPlayer.once(AudioPlayerStatus.Idle, () => {
      if (this.isPlayingWaiting) {
        this._loopWaiting(filePath);
      }
    });
    this.waitingPlayer.once('error', (err) => {
      console.error('[AudioSystem] Waiting loop error:', err.message);
    });
  }

  stopWaiting() {
    this.isPlayingWaiting = false;
    if (this.waitingPlayer) {
      this.waitingPlayer.stop(true);
      this.waitingPlayer = null;
    }
    if (this.waitingConnection) {
      try { this.waitingConnection.destroy(); } catch (_) {}
      this.waitingConnection = null;
    }
  }
}

module.exports = new AudioSystem();
