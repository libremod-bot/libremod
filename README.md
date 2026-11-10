# Libremod

Kostenloser, quelloffener Moderations- und Administrations-Bot für Discord.

- **Keine Paywall.** Jede Funktion ist für jeden Server frei nutzbar, ohne Premium-Stufen.
- **Selbst hostbar.** Mit Docker in wenigen Minuten auf dem eigenen Server.
- **Open Source.** Lizenziert unter der [AGPL-3.0](LICENSE): Wer Libremod verändert und öffentlich betreibt, muss seinen Code ebenfalls offenlegen.

Website: [libremod.dev](https://libremod.dev) · Geplante Funktionen: [ROADMAP.md](ROADMAP.md)

> Libremod befindet sich in einer frühen Entwicklungsphase.

## Aufbau

| Ordner           | Inhalt                                                |
| ---------------- | ----------------------------------------------------- |
| `apps/bot`       | Der Discord-Bot (TypeScript, discord.js)              |
| `apps/dashboard` | Web-Dashboard mit Discord-Login (folgt)               |
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
```

Vor einem Pull Request: `pnpm typecheck && pnpm build`.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE)
