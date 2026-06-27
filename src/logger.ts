import { Client, TextChannel } from 'discord.js';
import { PING_CHANNEL_ID } from './config.js';

export type LogEvent =
  | 'waiting'
  | 'taken'
  | 'ended'
  | 'busy'
  | 'offline';

const LOG_MESSAGES: Record<LogEvent, string> = {
  waiting: '🟡 Wartend',
  taken:   '🟢 Übernommen',
  ended:   '🔴 Beendet',
  busy:    '🟠 Alle besetzt',
  offline: '⚫ Niemand online',
};

export async function sendLog(
  client: Client,
  event: LogEvent,
  details?: string,
): Promise<void> {
  const channel = client.channels.cache.get(PING_CHANNEL_ID);
  if (!(channel instanceof TextChannel)) {
    console.error(`[Logger] Ping-Channel ${PING_CHANNEL_ID} nicht gefunden oder kein Textkanal`);
    return;
  }
  const message = details
    ? `${LOG_MESSAGES[event]} — ${details}`
    : LOG_MESSAGES[event];
  try {
    await channel.send(message);
  } catch (err) {
    console.error('[Logger] Nachricht konnte nicht gesendet werden:', err);
  }
}
