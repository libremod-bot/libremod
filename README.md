# Libremod

Kostenloser, quelloffener Moderations- und Administrations-Bot für Discord.

- **Keine Paywall.** Jede Funktion ist für jeden Server frei nutzbar, ohne Premium-Stufen.
- **Selbst hostbar.** Mit Docker in wenigen Minuten auf dem eigenen Server.
- **Open Source.** Lizenziert unter der [AGPL-3.0](LICENSE): Wer Libremod verändert und öffentlich betreibt, muss seinen Code ebenfalls offenlegen.

Website: [libremod.dev](https://libremod.dev) · Geplante Funktionen: [ROADMAP.md](ROADMAP.md)

> Libremod befindet sich in einer frühen Entwicklungsphase.

## Befehle

| Befehl                                | Wofür                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| `/warn`                               | Verwarnung mit Grund                                         |
| `/timeout`, `/untimeout`              | Stummschalten für eine Dauer (z. B. `10m`, `2h`, `1d`)       |
| `/kick`                               | Vom Server werfen                                            |
| `/ban`, `/unban`                      | Bannen, auf Wunsch befristet (`dauer: 7d`), läuft selbst aus |
| `/purge`                              | Bis zu 100 Nachrichten aufräumen, optional nur von einer Person |
| `/cases`, `/case show/reason/revoke`  | Fallakte ansehen, Gründe ändern, Verwarnungen zurücknehmen   |
| `/config modlog/dm/escalation/show`   | Mod-Log-Kanal, Direktnachrichten, Verwarnungsstufen          |
| `/automod status/toggle/filter`       | Auto-Moderation: Spam, Einladungen, Links, Wortfilter, Großbuchstaben, Massen-Erwähnungen |
| `/automod words/links/exempt/raid`    | Wortliste, erlaubte Domains, Ausnahmen, Raid-Schutz          |
| `/welcome test`                       | Begrüßung und Abschied zur Probe ansehen (einstellen im Dashboard) |
| `/rank`, `/leaderboard`               | Level, XP und Rangliste                                      |
| `/xp add/remove/set/reset`            | XP von Mitgliedern verwalten                                 |
| `/ticket close/claim/add/remove/rename` | Tickets verwalten: schließen, übernehmen, Leute hinzufügen oder entfernen, umbenennen |
| `/balance`, `/daily`, `/work`, `/pay`   | Server-Währung: Guthaben, täglicher Bonus, Arbeiten, Überweisen |
| `/shop`, `/buy`, `/inventory`, `/richlist` | Shop, Kaufen (mit Vorschlägen), gekaufte Artikel, Rangliste |
| `/coins add/remove/set`               | Guthaben von Mitgliedern verwalten (Team)                     |
| `/giveaway start/end/reroll/list`     | Gewinnspiele mit Mitmach-Knopf, Bedingungen und Neu-Auslosen (Team) |
| `/poll`                               | Umfrage mit bis zu 10 Antworten, Laufzeit und Mehrfachauswahl |
| `/remind set/list/delete`             | Erinnerungen im Kanal oder per Direktnachricht               |
| `/birthday set/remove/show/list`      | Geburtstag eintragen und die nächsten Geburtstage ansehen    |
| `/logging status/set/off/ignore`      | Logs für Nachrichten, Beitritte, Mitglieder, Server und Sprachkanäle, je Art ein eigener Kanal |

Dazu kommen eigene Befehle, die du im Dashboard anlegst. Geplante Nachrichten, Zähler-Kanäle, temporäre Sprachkanäle, Benachrichtigungen (YouTube, Twitch, Kick, Reddit, RSS), die Server-Währung mit Shop, Gewinnspiele, Geburtstage (Glückwunsch-Kanal, Uhrzeit, Geburtstagsrolle), das Ticket-System (Ticket-Arten mit Formularfragen, Panels, Team-Rollen, Transkripte, Bewertungen), den Highlight-Kanal, automatisches Kanal-Leeren und den automatischen Langsam-Modus richtest du ebenfalls dort ein.

Im Discord Developer Portal müssen unter **Bot → Privileged Gateway Intents** die Optionen **Server Members Intent** und **Message Content Intent** eingeschaltet sein (für Auto-Moderation, Raid-Schutz und Logging).

Der Bot braucht auf dem Server die Rechte **Mitglieder kicken**, **Mitglieder bannen**, **Mitglieder im Timeout**, **Nachrichten verwalten**, **Rollen verwalten** (für Auto-Rollen und Rollen-Panels), **Kanäle verwalten** und **Mitglieder verschieben** (für Zähler-Kanäle, temporäre Sprachkanäle und den Langsam-Modus), **Nachrichtenverlauf lesen** (für Highlights und Kanal-Leeren), **@everyone erwähnen** (nur falls Benachrichtigungen das sollen), **Threads verwalten**, **Private Threads erstellen** und **Nachrichten in Threads senden** (für Tickets als private Threads), **Umfragen erstellen** (für `/poll`) und **Nachrichten senden**, **Links einbetten** und **Dateien anhängen** im Mod-Log- und in den Log-Kanälen. Seine Rolle muss über den Rollen der Mitglieder stehen, die er moderieren soll.

## Aufbau

| Ordner           | Inhalt                                                |
| ---------------- | ----------------------------------------------------- |
| `apps/bot`       | Der Discord-Bot (TypeScript, discord.js)              |
| `apps/dashboard` | Web-Dashboard mit Discord-Login (Next.js)             |
| `packages/shared`| Gemeinsame Logik (Dauer-Angaben, Auto-Mod-Filter)     |
| `packages/db`    | Datenbankschema und Migrationen (PostgreSQL, Drizzle) |

## Selbst hosten mit Docker

Voraussetzungen: Docker mit Compose und eine Anwendung im [Discord Developer Portal](https://discord.com/developers/applications).

```bash
git clone https://github.com/libremod-bot/libremod.git
cd libremod
cp .env.example .env        # Token, Client-ID und ein Datenbank-Passwort eintragen
docker compose up -d --build
```

Die Datenbank-Migrationen laufen beim Start des Bots automatisch.

Slash-Befehle bei Discord registrieren (einmalig und nach jeder Änderung an den Befehlen):

```bash
docker compose run --rm bot node dist/deploy-commands.js
```

## Dashboard einrichten

Das Dashboard startet mit `docker compose up -d` automatisch mit und lauscht nur lokal auf Port 3000 (`DASHBOARD_PORT`).

1. Im Discord Developer Portal unter **OAuth2** das **Client Secret** kopieren und unter **Redirects** `https://dashboard.libremod.xyz/api/auth/callback` eintragen (bzw. deine eigene Adresse).
2. In der `.env` `DISCORD_CLIENT_SECRET`, `DASHBOARD_URL` und `SESSION_SECRET` setzen. Ein passendes Secret erzeugt `openssl rand -hex 32`.
3. Einen Reverse Proxy mit HTTPS davorschalten, zum Beispiel mit Caddy:

```
dashboard.libremod.xyz {
    reverse_proxy 127.0.0.1:3000
}
```

oder mit nginx (Zertifikat z. B. über certbot):

```nginx
server {
    server_name dashboard.libremod.xyz;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Änderungen im Dashboard übernimmt der Bot sofort.

## Benachrichtigungen für Twitch und Kick

YouTube, Reddit und RSS-Feeds funktionieren ohne Zugangsdaten. Für Livestream-Meldungen von Twitch und Kick braucht die Instanz eine eigene, kostenlose Anwendung bei der jeweiligen Plattform:

- **Twitch:** Unter [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) eine Anwendung anlegen (Kategorie beliebig, OAuth-Redirect z. B. `http://localhost`), dann `TWITCH_CLIENT_ID` und `TWITCH_CLIENT_SECRET` in die `.env` eintragen.
- **Kick:** Unter [kick.com/settings/developer](https://kick.com/settings/developer) eine Anwendung anlegen, dann `KICK_CLIENT_ID` und `KICK_CLIENT_SECRET` eintragen.

Danach Bot und Dashboard neu starten. Ohne diese Angaben ist die Plattform im Dashboard ausgegraut.

## Entwicklung

Voraussetzungen: Node.js 22 und pnpm.

```bash
pnpm install
cp .env.example .env
# Lokale Test-Datenbank auf Port 5432 (Zugangsdaten wie in .env.example)
docker run -d --name libremod-db -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=libremod -e POSTGRES_PASSWORD=bitte-aendern -e POSTGRES_DB=libremod \
  postgres:17-alpine
pnpm deploy-commands
pnpm dev:bot
pnpm --filter @libremod/dashboard dev   # Dashboard auf http://localhost:3000
```

Vor einem Pull Request: `pnpm typecheck && pnpm build && pnpm test`.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE)
