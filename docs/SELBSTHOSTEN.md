# Libremod selbst hosten

Diese Anleitung zeigt Schritt für Schritt, wie du Libremod auf deinem eigenen Server einrichtest. Du brauchst keine Programmierkenntnisse, nur etwas Erfahrung mit der Kommandozeile (per SSH auf einen Server verbinden und Befehle eintippen).

Libremod läuft danach komplett bei dir. Es gibt keinen zentralen Libremod-Server, an den irgendetwas gemeldet wird.

**Inhalt**

1. [Was du brauchst](#1-was-du-brauchst)
2. [Discord-Anwendung anlegen](#2-discord-anwendung-anlegen)
3. [Domain vorbereiten (optional)](#3-domain-vorbereiten-optional)
4. [Installieren](#4-installieren)
5. [Nach der Installation](#5-nach-der-installation)
6. [Libremod verwalten](#6-libremod-verwalten)
7. [Datensicherung und Umzug](#7-datensicherung-und-umzug)
8. [Updates](#8-updates)
9. [Eigener Webserver](#9-eigener-webserver-nginx-apache)
10. [Was wohin gesendet wird](#10-was-wohin-gesendet-wird)
11. [Hilfe bei Problemen](#11-hilfe-bei-problemen)
12. [Ohne Install-Skript](#12-ohne-install-skript)

---

## 1. Was du brauchst

- **Einen Linux-Server**, der rund um die Uhr läuft, zum Beispiel einen kleinen VServer bei einem Hoster oder einen Raspberry Pi 4/5 zu Hause.
  - Getestet mit **Debian 12/13** und **Ubuntu 22.04/24.04**. Andere Systeme gehen auch, wenn Docker schon installiert ist.
  - Mindestens **1 GB RAM** und **5 GB freier Speicher**. Mit 2 GB RAM läuft alles entspannter.
  - Prozessor: x86_64 (amd64) oder arm64.
- **Einen Discord-Account**, mit dem du die Bot-Anwendung anlegst.
- **Eine Domain oder Subdomain** für das Dashboard, z. B. `dashboard.deine-domain.de`. Ohne Domain geht es auch, dann ist das Dashboard nur auf dem Server selbst bzw. über einen SSH-Tunnel erreichbar.

## 2. Discord-Anwendung anlegen

Jede Libremod-Installation hat ihren eigenen Bot. Den legst du im Discord Developer Portal an:

1. Öffne [discord.com/developers/applications](https://discord.com/developers/applications) und melde dich an.
2. Klicke auf **New Application**, gib einen Namen ein (z. B. „Libremod“ oder den Namen deines Servers) und bestätige.
3. Optional unter **General Information**: Profilbild und Beschreibung des Bots festlegen.
4. Links auf **Bot**:
   - **Reset Token** klicken und den Token kopieren. Er wird nur einmal angezeigt. Behandle ihn wie ein Passwort: Wer ihn hat, steuert deinen Bot.
   - Weiter unten unter **Privileged Gateway Intents** diese beiden Schalter einschalten und **Save Changes** klicken:
     - **Server Members Intent**
     - **Message Content Intent**
   - Wenn nur du den Bot einladen können sollst: **Public Bot** ausschalten.
5. Links auf **OAuth2**: Unter **Client Secret** auf **Reset Secret** klicken und das Secret kopieren.

Token und Client Secret brauchst du gleich beim Installieren. Die Redirect-Adresse trägst du erst danach ein, das Skript sagt dir genau welche.

## 3. Domain vorbereiten (optional)

Wenn das Dashboard über eine eigene Adresse erreichbar sein soll, lege bei deinem Domain-Anbieter einen DNS-Eintrag an:

| Typ    | Name                             | Wert                    |
| ------ | -------------------------------- | ----------------------- |
| `A`    | `dashboard` (bzw. deine Subdomain) | IPv4-Adresse deines Servers |
| `AAAA` | `dashboard`                      | IPv6-Adresse (falls vorhanden) |

Es kann ein paar Minuten dauern, bis der Eintrag überall bekannt ist. Das Install-Skript prüft ihn und warnt, wenn er noch nicht stimmt.

## 4. Installieren

Verbinde dich per SSH mit deinem Server und führe aus:

```bash
curl -fsSL https://raw.githubusercontent.com/libremod-bot/libremod/main/deploy/install.sh -o install.sh
sudo bash install.sh
```

> Tipp: Du kannst dir das Skript vorher mit `less install.sh` ansehen. Es ist ausführlich kommentiert.

Das Skript führt dich durch alles:

1. **Werkzeuge und Docker:** Fehlt Docker, wird es mit dem offiziellen Skript von docker.com installiert.
2. **Discord:** Du fügst Token und Client Secret ein (die Eingabe ist unsichtbar). Das Skript fragt bei Discord nach, ob beides stimmt, und erkennt die Anwendungs-ID selbst. Fehlen die beiden Intents aus Schritt 2, sagt es dir das und wartet, bis du sie eingeschaltet hast.
3. **Dashboard-Adresse:** Du wählst eine von drei Möglichkeiten:
   - **1) Eigene Domain mit automatischem HTTPS** (empfohlen): Libremod bringt den Webserver Caddy mit, der sich selbst ein kostenloses Zertifikat von Let's Encrypt holt und es verlängert. Dafür müssen die Ports 80 und 443 frei sein.
   - **2) Eigene Domain, eigener Webserver:** Wenn auf dem Server schon nginx, Apache oder ein anderer Webserver läuft. Das Dashboard lauscht dann nur lokal, und du leitest die Domain selbst dorthin weiter (siehe [Abschnitt 9](#9-eigener-webserver-nginx-apache)).
   - **3) Nur zum Ausprobieren:** Das Dashboard ist nur unter `http://localhost` erreichbar.
4. **Einrichten:** Das Skript erzeugt sichere Passwörter für Datenbank und Login, schreibt alles nach `/opt/libremod/.env` (nur für root lesbar), lädt Libremod herunter, startet es und registriert die Slash-Befehle bei Discord.
5. **Updates:** Du wählst, ob Libremod neue Versionen nachts selbst installiert (alle 24 oder 48 Stunden) oder dir nur im Dashboard Bescheid gibt. Unter Debian und Ubuntu fragt das Skript außerdem, ob es automatische Sicherheitsupdates für das System und Docker einschalten soll (siehe [Abschnitt 8](#8-updates)).
6. **Sicherung:** Eine tägliche Datensicherung um 3:30 Uhr wird eingerichtet.

Die ganze Installation dauert je nach Server etwa 3 bis 10 Minuten.

## 5. Nach der Installation

Am Ende zeigt das Skript drei Dinge an:

1. **Redirect-Adresse:** Trage sie im Developer Portal unter **OAuth2 → Redirects → Add Redirect** ein und speichere. Sie sieht so aus: `https://dashboard.deine-domain.de/api/auth/callback`. Ohne diesen Eintrag klappt die Anmeldung im Dashboard nicht.
2. **Einladungslink:** Damit lädst du den Bot auf deinen Discord-Server ein. Du findest ihn auch später im Dashboard.
3. **Dashboard-Adresse:** Öffne sie im Browser und melde dich mit Discord an.

Im Dashboard siehst du alle Server, auf denen du „Server verwalten“ darfst. Als Besitzer der Bot-Anwendung findest du unten auf der Serverliste außerdem den Link zur **Statusseite**: Dort stehen Version, Verbindung zu Discord, Anzahl der Server und wann zuletzt gesichert wurde.

Slash-Befehle wie `/ban` erscheinen nach wenigen Minuten. Falls nicht: Discord einmal neu laden (Strg+R).

## 6. Libremod verwalten

Das Install-Skript richtet auf dem Server den Befehl `libremod` ein:

| Befehl                         | Was er tut                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| `libremod status`              | Zeigt, ob Datenbank, Bot und Dashboard laufen, und die letzte Sicherung |
| `libremod logs bot`            | Meldungen des Bots live ansehen (Strg+C beendet), auch `dashboard`, `db`, `caddy` |
| `libremod restart`             | Alles neu starten                                                  |
| `libremod stop` / `start`      | Libremod anhalten bzw. wieder starten                              |
| `libremod update`              | Neueste Version holen, vorher wird automatisch gesichert           |
| `libremod autoupdate`          | Automatische Updates anzeigen, mit `24`, `48` oder `aus` ändern; `system an`/`aus` für Sicherheitsupdates von System und Docker |
| `libremod backup`              | Datenbank jetzt sichern                                            |
| `libremod restore <Datei>`     | Eine Sicherung wiederherstellen                                    |
| `libremod config`              | Einstellungen (`.env`) im Editor öffnen und danach neu starten     |
| `libremod commands`            | Slash-Befehle erneut bei Discord registrieren                      |
| `libremod version`             | Installierte Version anzeigen                                      |
| `libremod uninstall`           | Libremod entfernen (fragt, ob die Daten auch weg sollen)           |

Alle Dateien liegen in `/opt/libremod`:

```
/opt/libremod/
├── .env                 Einstellungen und Geheimnisse (nur root)
├── docker-compose.yml   wird bei Updates neu geschrieben
├── Caddyfile            HTTPS-Einstellungen (nur bei Option 1)
└── backups/             tägliche Sicherungen
```

Eigene Anpassungen an Docker gehören in eine Datei `docker-compose.override.yml` im selben Ordner, die bleibt bei Updates erhalten.

### Einstellungen in der `.env`

Die meisten Einstellungen machst du im Dashboard. In der `.env` stehen nur Dinge, die die ganze Installation betreffen:

| Einstellung                                | Bedeutung                                                     |
| ------------------------------------------ | ------------------------------------------------------------- |
| `DASHBOARD_URL`                            | Adresse des Dashboards                                        |
| `BACKUP_KEEP`                              | Wie viele tägliche Sicherungen behalten werden (Standard 14)  |
| `LIBREMOD_VERSION`                         | `latest` für die neueste Version oder fest, z. B. `0.19`      |
| `PHISHING_LISTS`                           | `off` schaltet das Laden der öffentlichen Betrugslink-Listen ab |
| `UPDATE_CHECK`                             | `off` schaltet die tägliche Suche nach neuen Versionen ab       |
| `AUTO_UPDATE_HOURS`                        | `24` oder `48` für automatische Updates, `0` für aus (Startwert, danach gilt die Einstellung im Dashboard) |
| `SYSTEM_UPDATES`                           | `on`, wenn Libremod automatische Sicherheitsupdates für System und Docker eingerichtet hat (ändern mit `libremod autoupdate system an`/`aus`) |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Für Twitch-Livestream-Meldungen ([Anwendung anlegen](https://dev.twitch.tv/console/apps), OAuth-Redirect z. B. `http://localhost`) |
| `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`     | Für Kick-Livestream-Meldungen ([Anwendung anlegen](https://kick.com/settings/developer)) |
| `LOG_LEVEL`                                | Wie gesprächig die Logs sind: `debug`, `info`, `warn`, `error` |

Nach einer Änderung: `libremod restart` (oder gleich `libremod config` benutzen).

## 7. Datensicherung und Umzug

Jede Nacht sichert Libremod die komplette Datenbank nach `/opt/libremod/backups/`. Die letzten 14 Sicherungen bleiben erhalten (`BACKUP_KEEP`). Eine Sicherung ist meist nur wenige MB groß.

**Wichtig:** Die Sicherungen liegen auf demselben Server. Fällt die Festplatte aus, sind sie mit weg. Kopiere sie deshalb ab und zu woanders hin, zum Beispiel von deinem eigenen Rechner aus:

```bash
scp -r root@dein-server:/opt/libremod/backups ./libremod-backups
```

**Wiederherstellen:**

```bash
libremod restore /opt/libremod/backups/libremod-2026-11-12-033000.dump
```

Vorher wird der aktuelle Stand gesichert. Schlägt die Wiederherstellung fehl, bleibt die Datenbank unverändert.

**Auf einen neuen Server umziehen:**

1. Auf dem alten Server: `libremod backup` und die neueste Datei aus `/opt/libremod/backups/` sowie die Datei `/opt/libremod/.env` auf deinen Rechner kopieren.
2. Auf dem neuen Server Libremod mit dem Install-Skript einrichten (gleicher Token, gleiches Client Secret).
3. Die Sicherung auf den neuen Server kopieren und `libremod restore <Datei>` ausführen.
4. Den DNS-Eintrag der Domain auf den neuen Server ändern.
5. Den alten Server stoppen: `libremod stop`. Zwei Installationen mit demselben Token sollten nie gleichzeitig laufen.

Nur die Einstellungen eines einzelnen Discord-Servers (ohne Mitgliederdaten) kannst du auch im Dashboard unter **Export / Import** sichern.

## 8. Updates

Du musst dich um Updates nicht auf der Kommandozeile kümmern. Es gibt drei Wege, und bei allen wird vorher die Datenbank gesichert:

**Im Dashboard per Knopfdruck.** Der Bot sieht einmal am Tag bei GitHub nach, ob es eine neue Version gibt. Dann steht auf der **Statusseite** (nur für die Besitzer der Bot-Anwendung) „Version … ist erschienen“ mit dem Knopf **Jetzt aktualisieren**. Innerhalb einer Minute startet der Server das Update, die Seite zeigt den Fortschritt und danach das Ergebnis mit den letzten Meldungen.

**Automatisch.** Auf der Statusseite unter „Automatisch aktualisieren“ (oder mit `libremod autoupdate 24`) stellst du ein, dass Libremod neue Versionen selbst installiert. Das passiert nachts zwischen 4 und 5 Uhr Serverzeit, nur wenn es wirklich eine neue Version gibt, und höchstens alle 24 bzw. 48 Stunden.

**Von Hand** auf dem Server:

```bash
libremod update
```

Alle drei machen dasselbe: Datenbank sichern, das neueste Install-Skript und die neuesten Programme holen, neu starten und neue Slash-Befehle registrieren. Einstellungen und Daten bleiben erhalten. Datenbank-Änderungen spielt der Bot beim Start automatisch ein.

**Wie das sicher bleibt:** Das Dashboard bekommt keinen Zugriff auf Docker oder den Server. Es trägt nur „Update gewünscht“ in die Datenbank ein. Auf dem Server prüft ein kleiner Dienst (`libremod-updater.timer`, läuft jede Minute) diesen Eintrag und startet dann `libremod update`. Anfordern dürfen das nur die Besitzer der Bot-Anwendung.

**System und Docker aktuell halten.** Unter Debian und Ubuntu kann Libremod automatische Sicherheitsupdates einschalten (`libremod autoupdate system an`). Dafür wird das Paket `unattended-upgrades` installiert; es spielt täglich Sicherheitsupdates des Systems und neue Docker-Versionen ein. Der Server wird dabei nicht automatisch neu gestartet. Wird Docker aktualisiert, starten die Libremod-Container kurz neu. Abschalten mit `libremod autoupdate system aus`.

Was sich geändert hat, steht in der [Roadmap](../ROADMAP.md) bzw. bei den Releases auf GitHub.

Willst du nicht automatisch die neueste Version, setze in der `.env` `LIBREMOD_VERSION` auf eine feste Version, z. B. `0.19`. Dann bekommst du nur noch Fehlerbehebungen dieser Version.

## 9. Eigener Webserver (nginx, Apache)

Hast du bei der Installation Option 2 gewählt, lauscht das Dashboard nur lokal auf dem Port aus `DASHBOARD_PORT` (das Skript nennt ihn dir, Standard 3000). Leite deine Domain mit HTTPS dorthin weiter.

**nginx** (z. B. `/etc/nginx/sites-available/libremod`):

```nginx
server {
    listen 80;
    server_name dashboard.deine-domain.de;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Dann aktivieren und ein Zertifikat holen:

```bash
ln -s /etc/nginx/sites-available/libremod /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d dashboard.deine-domain.de
```

**Apache** (Module `proxy`, `proxy_http`, `headers` aktivieren):

```apache
<VirtualHost *:80>
    ServerName dashboard.deine-domain.de
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

Zertifikat: `certbot --apache -d dashboard.deine-domain.de`

**Caddy** (falls schon vorhanden):

```
dashboard.deine-domain.de {
    reverse_proxy 127.0.0.1:3000
}
```

## 10. Was wohin gesendet wird

Libremod meldet nichts an die Entwickler. Es gibt keine Telemetrie, keine Nutzungsstatistik und keinen zentralen Server. Deine Installation spricht nur mit:

| Gegenstelle                    | Wofür                                                                 |
| ------------------------------ | --------------------------------------------------------------------- |
| **Discord**                    | Der Bot selbst und die Anmeldung im Dashboard                         |
| **GitHub** (`ghcr.io`, `raw.githubusercontent.com`) | Programme und Install-Skript herunterladen (nur bei Installation und Updates) |
| **GitHub** (`api.github.com`)  | Einmal am Tag nachsehen, ob es eine neue Version gibt. Gesendet wird nur die Anfrage selbst, abschaltbar mit `UPDATE_CHECK=off` |
| **GitHub** (Betrugslink-Listen) | Alle 6 Stunden zwei öffentliche Listen herunterladen. Es wird dabei nichts gesendet, abschaltbar mit `PHISHING_LISTS=off` |
| **Docker Hub**                 | Datenbank- und Caddy-Programm herunterladen                           |
| **Let's Encrypt**              | HTTPS-Zertifikat (nur bei Option 1)                                   |
| **YouTube, Twitch, Kick, Reddit, RSS-Feeds** | Nur wenn ein Server Benachrichtigungen dafür einrichtet     |

Alle Daten (Einstellungen, Fälle, Level usw.) liegen ausschließlich in der Datenbank auf deinem Server. Du bist damit auch selbst verantwortlich für deine Installation, zum Beispiel für eine Datenschutzerklärung, wenn du den Bot für andere betreibst.

## 11. Hilfe bei Problemen

**Erster Schritt bei jedem Problem:**

```bash
libremod status
libremod logs bot
```

**Der Bot ist offline / „Used disallowed intents“ in den Logs**
Im Developer Portal unter **Bot** fehlen die Schalter **Server Members Intent** oder **Message Content Intent**. Einschalten, speichern, `libremod restart`.

**„An invalid token was provided“**
Der Token wurde im Developer Portal neu erzeugt. Neuen Token holen, mit `libremod config` bei `DISCORD_TOKEN=` eintragen, speichern.

**Die Anmeldung im Dashboard schlägt fehl („Invalid OAuth2 redirect_uri“)**
Die Redirect-Adresse fehlt oder ist falsch geschrieben. Im Developer Portal unter **OAuth2 → Redirects** muss genau `DASHBOARD_URL` + `/api/auth/callback` stehen, also z. B. `https://dashboard.deine-domain.de/api/auth/callback`.

**Das Dashboard ist nicht erreichbar / kein HTTPS-Zertifikat**
- Zeigt der DNS-Eintrag auf den Server? Prüfen mit `getent hosts dashboard.deine-domain.de`.
- Sind die Ports 80 und 443 in der Firewall des Hosters freigegeben? Bei `ufw`: `ufw allow 80,443/tcp`.
- Was sagt Caddy? `libremod logs caddy`

**Slash-Befehle fehlen**
`libremod commands` ausführen und Discord neu laden. Der Bot braucht beim Einladen das Recht „Anwendungsbefehle“ (ist im Einladungslink enthalten).

**Der Server hat wenig Speicher**
`docker system prune` räumt alte Programmversionen auf. Logs sind auf 30 MB pro Dienst begrenzt.

**Ich habe das Install-Skript abgebrochen**
Einfach noch einmal starten. Ist Libremod schon eingerichtet, bietet es ein Update an. Komplett neu anfangen: `libremod uninstall` und die Frage nach dem Löschen der Daten mit „j“ beantworten.

Kommst du nicht weiter, öffne ein Issue auf GitHub. Bitte füge die Ausgabe von `libremod status` und die letzten Zeilen von `libremod logs bot` bei, aber **niemals** den Inhalt der `.env`.

## 12. Ohne Install-Skript

Du kannst Libremod auch von Hand mit Docker Compose betreiben, entweder mit den fertigen Images oder aus dem Quellcode:

```bash
git clone https://github.com/libremod-bot/libremod.git
cd libremod
cp .env.example .env     # alle Werte ausfüllen, Secrets z. B. mit: openssl rand -hex 32
docker compose up -d --build
docker compose run --rm bot node dist/deploy-commands.js
```

Die fertigen Images heißen `ghcr.io/libremod-bot/libremod-bot` und `ghcr.io/libremod-bot/libremod-dashboard` (Tags: `latest`, Versionsnummern wie `0.19`, `edge` für den neuesten Entwicklungsstand). Das Dashboard braucht die Datenbank und dieselben Discord-Werte wie der Bot. Es lauscht auf Port 3000 und gehört hinter einen Reverse Proxy mit HTTPS.
