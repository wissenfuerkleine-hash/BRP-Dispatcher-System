import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

// Make the bundled ffmpeg binary available in PATH so prism-media finds it
if (ffmpegStatic) {
  process.env.PATH = `${path.dirname(ffmpegStatic)}:${process.env.PATH ?? ''}`;
  console.log('[Audio] FFmpeg gesetzt:', ffmpegStatic);
}

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

const AUDIO_DIR = path.resolve('audio');

function getRandomTrack(): string {
  const files = fs.readdirSync(AUDIO_DIR).filter(f => f.endsWith('.mp3'));
  if (files.length === 0) throw new Error(`[Audio] Keine MP3-Dateien in ${AUDIO_DIR} gefunden`);
  const pick = files[Math.floor(Math.random() * files.length)];
  return path.join(AUDIO_DIR, pick as string);
}

let looping = false;

function buildLoopingPlayer() {
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  const playNext = () => {
    if (!looping) return;
    const track = getRandomTrack();
    console.log('[Audio] Spiele:', path.basename(track));
    const resource = createAudioResource(track);
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
