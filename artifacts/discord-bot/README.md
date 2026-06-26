# Discord Voice Support Dispatcher

Ein vollständiges Discord.js v14 Voice Support System mit Express Dashboard und MongoDB.

## Features

- **Voice Warteraum** — erkennt Joins automatisch, fügt User in Queue ein
- **Dispatcher** — findet freien Supporter-Raum, wartet 10 Sek, moved den Bürger
- **Audio System** — spielt waiting.mp3 (Loop), busy.mp3, offline.mp3 ab
- **Slash Command** `/endsupport` — Supporter beendet aktiven Support
- **Live Dashboard** — Echtzeit-Anzeige mit Socket.io (Queue, Räume, Stats)
- **Audio Upload** — mp3 Dateien per Dashboard hochladen
- **MongoDB** — Settings, Queue, Sessions, Statistik

## Setup

### 1. Abhängigkeiten installieren

```bash
npm install
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
```

Trage in `.env` ein:
- `DISCORD_TOKEN` — Bot Token aus dem [Discord Developer Portal](https://discord.com/developers/applications)
- `CLIENT_ID` — Application ID deines Bots
- `MONGODB_URI` — MongoDB Connection String (z.B. MongoDB Atlas)
- `PORT` — Dashboard Port (Standard: 3000)

### 3. Audio Dateien platzieren

```
/audio/waiting.mp3   ← Wartemusik (wird geloopt)
/audio/busy.mp3      ← Alle Supporter belegt
/audio/offline.mp3   ← Kein Supporter online
```

Alternativ per Dashboard hochladen.

### 4. Bot Berechtigungen

Im Discord Developer Portal → Bot → Privileged Gateway Intents aktivieren:
- ✅ Server Members Intent
- ✅ Voice State (automatisch mit GUILDS Intent)

Bot Invite Berechtigungen:
- `Move Members`
- `Manage Channels` (Rooms locken)
- `Send Messages`
- `Connect` / `Speak`

### 5. Starten

```bash
node index.js
```

Dashboard läuft auf `http://localhost:3000`

## Railway Deployment

1. Projekt auf Railway erstellen
2. Environment Variables setzen (DISCORD_TOKEN, CLIENT_ID, MONGODB_URI)
3. `PORT` wird automatisch von Railway gesetzt
4. `npm start` als Start Command

## IDs konfigurieren

In `config.js`:

| Konstante | ID |
|---|---|
| `WAITING_ROOM_ID` | 1512120421007495248 |
| `PING_CHANNEL_ID` | 1514334207747428572 |
| `SUPPORTER_ROLE_ID` | 1515119690219786250 |
| `SUPPORT_ROOM_IDS` | 5 Voice Channels |

## Dashboard Funktionen

| Funktion | Beschreibung |
|---|---|
| Live Queue | Wartende User mit Wartezeit |
| Support Räume | Frei/Belegt, Supporter, Bürger, Laufzeit |
| Support beenden | Button pro Raum + API |
| Queue leeren | Alle User aus Queue entfernen |
| Channel reset | Berechtigungen zurücksetzen |
| Delay ändern | Dispatch-Delay in ms anpassen |
| Audio Upload | waiting.mp3 / busy.mp3 / offline.mp3 ersetzen |
| Statistik | Gesamt-Fälle, Ø Wartezeit, Supporter-Ranking |

## Log Format

| Status | Farbe | Bedeutung |
|---|---|---|
| 🟡 Wartend | Gelb | User betritt Warteraum |
| 🟢 Übernommen | Grün | Bürger wurde in Support-Raum gemoved |
| 🔴 Beendet | Rot | Support wurde beendet |
| 🟠 Alle besetzt | Orange | Supporter online, aber alle Räume voll |
| ⚫ Niemand online | Schwarz | Kein Supporter in einem Support-Raum |
