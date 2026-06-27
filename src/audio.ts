import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice';
import { VoiceBasedChannel } from 'discord.js';
import path from 'path';

const WAITING_MUSIC_PATH = path.resolve('audio/waiting.mp3');

let looping = false;

function buildLoopingPlayer() {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  const playNext = () => {
    if (!looping) return;
    const resource = createAudioResource(WAITING_MUSIC_PATH);
    player.play(resource);
  };

  player.on(AudioPlayerStatus.Idle, playNext);

  player.on('error', (err) => {
    console.error('[Audio] Player-Fehler:', err.message);
  });

  playNext();
  return player;
}

export async function startWaitingMusic(channel: VoiceBasedChannel): Promise<void> {
  if (getVoiceConnection(channel.guild.id)) return;

  console.log('[Audio] Starte Wartemusik im Warteraum');

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  connection.on('error', (err) => {
    console.error('[Audio] Verbindungsfehler:', err.message);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 8_000);
  } catch {
    console.warn('[Audio] Voice-Verbindung konnte nicht hergestellt werden');
    connection.destroy();
    return;
  }

  looping = true;
  const player = buildLoopingPlayer();
  connection.subscribe(player);
}

export function stopWaitingMusic(guildId: string): void {
  looping = false;
  const connection = getVoiceConnection(guildId);
  if (connection) {
    console.log('[Audio] Stoppe Wartemusik — Warteraum leer');
    connection.destroy();
  }
}
