import { REST, Routes } from 'discord.js';
import { data as endsupportData } from './endsupport.js';

export async function registerCommands(clientId: string, token: string): Promise<void> {
  const rest = new REST().setToken(token);

  const commands = [endsupportData.toJSON()];

  console.log('[Commands] Registriere Slash-Commands...');
  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[Commands] Slash-Commands erfolgreich registriert.');
  } catch (err) {
    console.error('[Commands] Fehler beim Registrieren der Commands:', err);
  }
}
