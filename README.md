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

Im Discord Developer Portal müssen unter **Bot → Privileged Gateway Intents** die Optionen **Server Members Intent** und **Message Content Intent** eingeschaltet sein (für Auto-Moderation und Raid-Schutz).

Der Bot braucht auf dem Server die Rechte **Mitglieder kicken**, **Mitglieder bannen**, **Mitglieder im Timeout**, **Nachrichten verwalten** und **Nachrichten senden** im Mod-Log-Kanal. Seine Rolle muss über den Rollen der Mitglieder stehen, die er moderieren soll.

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
