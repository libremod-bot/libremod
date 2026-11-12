#!/usr/bin/env bash
# shellcheck disable=SC1111
# =============================================================================
#  Libremod Install-Skript
#
#  Richtet Libremod (Discord-Bot + Dashboard) auf einem eigenen Linux-Server ein:
#    curl -fsSL https://raw.githubusercontent.com/libremod-bot/libremod/main/deploy/install.sh -o install.sh
#    sudo bash install.sh
#
#  Getestet mit Debian 12/13 und Ubuntu 22.04/24.04. Andere Systeme gehen, wenn Docker schon installiert ist.
#  Das Skript fragt alles Nötige ab. Es sendet nichts an die Libremod-Entwickler: Es spricht nur mit
#  Discord (Prüfen deiner Zugangsdaten), Docker/GitHub (Programme herunterladen) und deinem eigenen Server.
#
#  Optionen:
#    --update     Vorhandene Installation aktualisieren (Einstellungen bleiben), ohne Fragen
#    --help       Diese Hilfe
#
#  Lizenz: AGPL-3.0-only
# =============================================================================
set -Eeuo pipefail

LIBREMOD_DIR="${LIBREMOD_DIR:-/opt/libremod}"
LIBREMOD_IMAGE="${LIBREMOD_IMAGE:-ghcr.io/libremod-bot/libremod}"
LIBREMOD_VERSION="${LIBREMOD_VERSION:-latest}"
LIBREMOD_SCRIPT_URL="${LIBREMOD_SCRIPT_URL:-https://raw.githubusercontent.com/libremod-bot/libremod/main/deploy/install.sh}"
DISCORD_API="${DISCORD_API:-https://discord.com/api/v10}"
BOT_PERMISSIONS="564444887510102"
CLI_PATH="/usr/local/bin/libremod"

# --- Ausgabe -----------------------------------------------------------------
if [[ -t 1 ]]; then
  B=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' GRN=$'\e[32m' YEL=$'\e[33m' BLU=$'\e[36m' R=$'\e[0m'
else
  B="" DIM="" RED="" GRN="" YEL="" BLU="" R=""
fi
say() { printf '%s\n' "$*"; }
step() { printf '\n%s==> %s%s\n' "$B$BLU" "$*" "$R"; }
ok() { printf '%s✔%s %s\n' "$GRN" "$R" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$R" "$*" >&2; }
die() {
  printf '\n%s✘ %s%s\n' "$RED$B" "$*" "$R" >&2
  exit 1
}
trap 'die "Unerwarteter Fehler in Zeile $LINENO. Nichts kaputt: Du kannst das Skript einfach noch einmal starten."' ERR

# Eingaben kommen vom Terminal, auch wenn das Skript über eine Pipe gestartet wurde.
TTY=/dev/tty
have_tty() { [[ -r $TTY && -w $TTY ]] && { : <"$TTY"; } 2>/dev/null; }

# ask VAR "Frage" [Vorgabe]  - übernimmt einen schon gesetzten Wert (z. B. aus der Umgebung)
ask() {
  local var=$1 prompt=$2 def=${3-} answer
  if [[ -n ${!var-} ]]; then return; fi
  have_tty || die "Keine Eingabe möglich. Bitte das Skript in einem Terminal starten (oder $var setzen)."
  if [[ -n $def ]]; then printf '%s %s[%s]%s: ' "$prompt" "$DIM" "$def" "$R" >"$TTY"; else printf '%s: ' "$prompt" >"$TTY"; fi
  IFS= read -r answer <"$TTY" || true
  printf -v "$var" '%s' "${answer:-$def}"
}

# ask_secret VAR "Frage"  - Eingabe wird nicht angezeigt
ask_secret() {
  local var=$1 prompt=$2 answer
  if [[ -n ${!var-} ]]; then return; fi
  have_tty || die "Keine Eingabe möglich. Bitte das Skript in einem Terminal starten (oder $var setzen)."
  printf '%s %s(Eingabe wird nicht angezeigt)%s: ' "$prompt" "$DIM" "$R" >"$TTY"
  IFS= read -rs answer <"$TTY" || true
  printf '\n' >"$TTY"
  printf -v "$var" '%s' "$answer"
}

# yesno "Frage" j|n  - Rückgabe 0 bei Ja
yesno() {
  local prompt=$1 def=${2:-j} answer
  if ! have_tty; then [[ $def == j ]]; return; fi
  printf '%s %s[%s]%s: ' "$prompt" "$DIM" "$([[ $def == j ]] && echo J/n || echo j/N)" "$R" >"$TTY"
  IFS= read -r answer <"$TTY" || true
  answer=${answer:-$def}
  [[ ${answer,,} == j* || ${answer,,} == y* ]]
}

pause() { have_tty && { printf '%s' "${1:-Weiter mit Enter …}" >"$TTY"; IFS= read -r _ <"$TTY" || true; printf '\n' >"$TTY"; }; return 0; }

random_hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

usage() { sed -n '2,18p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; }

# --- Prüfungen ---------------------------------------------------------------
MODE=install
for arg in "$@"; do
  case $arg in
    --update) MODE=update ;;
    -h | --help) usage; exit 0 ;;
    *) die "Unbekannte Option: $arg (siehe --help)" ;;
  esac
done

[[ $(id -u) -eq 0 ]] || die "Bitte mit Administratorrechten starten: sudo bash install.sh"

case $(uname -m) in
  x86_64 | amd64 | aarch64 | arm64) ;;
  *) die "Dieser Prozessor ($(uname -m)) wird nicht unterstützt. Libremod läuft auf x86_64 (amd64) und arm64." ;;
esac

OS_ID="" OS_LIKE="" OS_NAME="Linux"
if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID=${ID:-} OS_LIKE=${ID_LIKE:-} OS_NAME=${PRETTY_NAME:-Linux}
fi
is_apt() { command -v apt-get >/dev/null 2>&1; }

if [[ $MODE == install ]]; then
  say ""
  say "${B}Libremod einrichten${R}"
  say "Kostenlose Moderation für Discord, auf deinem eigenen Server."
  say "${DIM}System: $OS_NAME · Ordner: $LIBREMOD_DIR${R}"
fi

# --- Werkzeuge und Docker ----------------------------------------------------
install_packages() {
  local missing=()
  for p in "$@"; do command -v "$p" >/dev/null 2>&1 || missing+=("$p"); done
  [[ ${#missing[@]} -eq 0 ]] && return
  is_apt || die "Bitte zuerst installieren: ${missing[*]}"
  step "Installiere ${missing[*]}"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" ca-certificates >/dev/null
  ok "Fertig"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    step "Installiere Docker"
    if [[ $OS_ID == debian || $OS_ID == ubuntu || $OS_LIKE == *debian* || $OS_LIKE == *ubuntu* || $OS_ID == fedora || $OS_ID == centos || $OS_ID == rhel ]]; then
      say "Docker wird mit dem offiziellen Skript von get.docker.com installiert."
      curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
      sh /tmp/get-docker.sh >/dev/null
      rm -f /tmp/get-docker.sh
    else
      die "Docker fehlt. Bitte Docker installieren (https://docs.docker.com/engine/install/) und das Skript erneut starten."
    fi
    ok "Docker installiert"
  fi
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    systemctl enable --now docker >/dev/null 2>&1 || true
  fi
  docker info >/dev/null 2>&1 || die "Docker läuft nicht. Prüfe mit: systemctl status docker"
  if ! docker compose version >/dev/null 2>&1; then
    if is_apt; then
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-plugin >/dev/null 2>&1 ||
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-compose-v2 >/dev/null 2>&1 || true
    fi
    docker compose version >/dev/null 2>&1 || die "Docker Compose fehlt. Bitte das Paket docker-compose-plugin installieren."
  fi
}

# --- Discord prüfen ----------------------------------------------------------
APP_ID="" APP_NAME="" APP_FLAGS=0

check_token() {
  local body code
  body=$(curl -sS -m 15 -w '\n%{http_code}' -H "Authorization: Bot $1" "$DISCORD_API/applications/@me" 2>/dev/null) || return 2
  code=${body##*$'\n'}
  body=${body%$'\n'*}
  [[ $code == 200 ]] || return 1
  APP_ID=$(jq -r '.id' <<<"$body")
  APP_NAME=$(jq -r '.name // "dein Bot"' <<<"$body")
  APP_FLAGS=$(jq -r '.flags // 0' <<<"$body")
}

check_secret() {
  local code
  code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -u "$1:$2" -d grant_type=client_credentials -d scope=identify "$DISCORD_API/oauth2/token" 2>/dev/null) || return 2
  [[ $code == 200 ]]
}

# Mitglieder (1<<14 oder 1<<15) und Nachrichteninhalt (1<<18 oder 1<<19) müssen im Portal eingeschaltet sein.
missing_intents() {
  local out=()
  (((APP_FLAGS & (1 << 14 | 1 << 15)) == 0)) && out+=("Server Members Intent")
  (((APP_FLAGS & (1 << 18 | 1 << 19)) == 0)) && out+=("Message Content Intent")
  printf '%s\n' "${out[@]}"
}

ask_discord() {
  step "Discord-Anwendung"
  say "Du brauchst eine eigene Anwendung im Discord Developer Portal: ${B}https://discord.com/developers/applications${R}"
  say "  1. ${B}New Application${R}, Namen wählen (z. B. Libremod), erstellen."
  say "  2. Links ${B}Bot${R}: ${B}Reset Token${R} und den Token kopieren."
  say "     Weiter unten ${B}Server Members Intent${R} und ${B}Message Content Intent${R} einschalten und speichern."
  say "  3. Links ${B}OAuth2${R}: das ${B}Client Secret${R} kopieren (Reset Secret)."
  say ""
  local tries=0 rc
  while :; do
    ask_secret DISCORD_TOKEN "Bot-Token"
    DISCORD_TOKEN=$(tr -d '[:space:]' <<<"$DISCORD_TOKEN")
    [[ -n $DISCORD_TOKEN ]] || { warn "Bitte den Token eingeben."; continue; }
    rc=0
    check_token "$DISCORD_TOKEN" || rc=$?
    if [[ $rc -eq 0 ]]; then break; fi
    [[ $rc -eq 2 ]] && die "Discord ist nicht erreichbar. Hat der Server Internet? (curl $DISCORD_API)"
    tries=$((tries + 1))
    have_tty && ((tries < 5)) || die "Discord kennt diesen Token nicht."
    warn "Discord kennt diesen Token nicht. Bitte im Portal unter Bot neu erzeugen und komplett kopieren."
    DISCORD_TOKEN=""
  done
  ok "Token passt zur Anwendung „$APP_NAME“ (ID $APP_ID)"
  DISCORD_CLIENT_ID=$APP_ID

  local missing
  missing=$(missing_intents)
  while [[ -n $missing ]]; do
    warn "Im Developer Portal fehlt unter Bot → Privileged Gateway Intents:"
    while IFS= read -r m; do say "    - $m"; done <<<"$missing"
    have_tty || die "Ohne diese Schalter kann sich der Bot nicht anmelden."
    pause "Einschalten, speichern und dann hier Enter drücken … "
    check_token "$DISCORD_TOKEN" || true
    missing=$(missing_intents)
  done
  ok "Benötigte Intents sind eingeschaltet"

  tries=0
  while :; do
    ask_secret DISCORD_CLIENT_SECRET "Client Secret (OAuth2)"
    DISCORD_CLIENT_SECRET=$(tr -d '[:space:]' <<<"$DISCORD_CLIENT_SECRET")
    [[ -n $DISCORD_CLIENT_SECRET ]] || { warn "Bitte das Client Secret eingeben."; continue; }
    rc=0
    check_secret "$DISCORD_CLIENT_ID" "$DISCORD_CLIENT_SECRET" || rc=$?
    [[ $rc -eq 0 ]] && break
    [[ $rc -eq 2 ]] && die "Discord ist nicht erreichbar."
    tries=$((tries + 1))
    have_tty && ((tries < 5)) || die "Das Client Secret passt nicht zur Anwendung."
    warn "Das Client Secret passt nicht. Bitte unter OAuth2 neu erzeugen und komplett kopieren."
    DISCORD_CLIENT_SECRET=""
  done
  ok "Client Secret passt"
}

# --- Erreichbarkeit des Dashboards -------------------------------------------
port_busy() { ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }

free_port() {
  local p=$1
  while port_busy "$p"; do p=$((p + 1)); done
  echo "$p"
}

local_ips() { hostname -I 2>/dev/null || ip -o addr show 2>/dev/null | awk '{print $4}' | cut -d/ -f1; }

check_dns() {
  local resolved
  resolved=$(getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
  if [[ -z $resolved ]]; then
    warn "$1 zeigt noch auf keine Adresse. Lege beim Domain-Anbieter einen A-Eintrag (und ggf. AAAA) auf diesen Server an."
    return 1
  fi
  local ip
  for ip in $resolved; do
    if grep -qw -- "$ip" <<<"$(local_ips)"; then return 0; fi
  done
  warn "$1 zeigt auf $resolved. Das ist keine Adresse dieses Servers (oder er steht hinter NAT)."
  return 1
}

ask_access() {
  step "Dashboard-Adresse"
  say "Wie soll das Dashboard erreichbar sein?"
  say "  ${B}1${R}) Eigene Domain mit automatischem HTTPS ${DIM}(empfohlen, Ports 80 und 443 müssen frei sein)${R}"
  say "  ${B}2${R}) Eigene Domain, ich habe schon einen Webserver (nginx, Apache, Caddy …)"
  say "  ${B}3${R}) Nur zum Ausprobieren auf diesem Rechner (http://localhost)"
  local def=1
  if port_busy 80 || port_busy 443; then
    def=2
    warn "Port 80 oder 443 ist schon belegt, vermutlich läuft hier ein Webserver. Dann passt Option 2."
  fi
  while :; do
    ask ACCESS "Auswahl" "$def"
    [[ $ACCESS =~ ^[123]$ ]] && break
    warn "Bitte 1, 2 oder 3 eingeben."
    ACCESS=""
  done

  if [[ $ACCESS == 1 || $ACCESS == 2 ]]; then
    while :; do
      ask DOMAIN "Domain für das Dashboard, z. B. dashboard.example.org"
      DOMAIN=$(tr -d '[:space:]' <<<"${DOMAIN,,}")
      DOMAIN=${DOMAIN#https://}
      DOMAIN=${DOMAIN#http://}
      DOMAIN=${DOMAIN%%/*}
      [[ $DOMAIN =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$ ]] && break
      warn "Das sieht nicht nach einer Domain aus."
      DOMAIN=""
    done
    if ! check_dns "$DOMAIN"; then
      if [[ $ACCESS == 1 ]]; then
        say "Ohne passenden DNS-Eintrag bekommt die Domain kein HTTPS-Zertifikat. Caddy versucht es automatisch weiter, sobald er stimmt."
      fi
      yesno "Trotzdem weitermachen?" j || die "Abgebrochen. DNS-Eintrag anlegen und das Skript erneut starten."
    fi
    DASHBOARD_URL="https://$DOMAIN"
  fi

  if [[ $ACCESS == 1 ]]; then
    if port_busy 80 || port_busy 443; then
      die "Port 80 oder 443 ist belegt. Bitte Option 2 wählen (eigener Webserver) oder den anderen Dienst beenden."
    fi
    ask ACME_EMAIL "E-Mail für Let's Encrypt (optional, für Warnungen zum Zertifikat)" ""
    COMPOSE_PROFILES=caddy
    DASHBOARD_PORT=$(free_port 3000)
  else
    COMPOSE_PROFILES=""
    DASHBOARD_PORT=$(free_port "${DASHBOARD_PORT:-3000}")
    [[ $ACCESS == 3 ]] && DASHBOARD_URL="http://localhost:$DASHBOARD_PORT"
  fi
  ok "Dashboard: $DASHBOARD_URL"
}

# --- Dateien schreiben -------------------------------------------------------
write_env() {
  local pg_pass session
  pg_pass=$(random_hex 24)
  session=$(random_hex 32)
  umask 077
  cat >"$LIBREMOD_DIR/.env" <<EOF
# Libremod-Einstellungen. Nach Änderungen: libremod restart
# Diese Datei enthält Geheimnisse. Nicht weitergeben und nicht ins Internet stellen.

# Discord-Anwendung „$APP_NAME“
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET=$DISCORD_CLIENT_SECRET
# Optional: Server-ID zum Testen (Befehle sofort nur dort)
DISCORD_DEV_GUILD_ID=

# Dashboard. Im Developer Portal unter OAuth2 -> Redirects muss stehen: $DASHBOARD_URL/api/auth/callback
DASHBOARD_URL=$DASHBOARD_URL
DASHBOARD_PORT=$DASHBOARD_PORT
SESSION_SECRET=$session
# Für die automatische HTTPS-Einrichtung (Caddy)
DASHBOARD_DOMAIN=${DOMAIN:-}
ACME_EMAIL=${ACME_EMAIL:-}
COMPOSE_PROFILES=$COMPOSE_PROFILES

# Datenbank (läuft im eigenen Container, nicht von außen erreichbar)
POSTGRES_USER=libremod
POSTGRES_PASSWORD=$pg_pass
POSTGRES_DB=libremod

# Version: latest = neueste Version, oder fest z. B. 0.17
LIBREMOD_IMAGE=$LIBREMOD_IMAGE
LIBREMOD_VERSION=$LIBREMOD_VERSION

# Datensicherung: wie viele tägliche Sicherungen behalten werden
BACKUP_KEEP=14

# Optional: Twitch und Kick für Livestream-Meldungen (siehe Anleitung)
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
KICK_CLIENT_ID=
KICK_CLIENT_SECRET=

# Öffentliche Betrugslink-Listen laden (nur Download, es wird nichts gesendet). off = aus
PHISHING_LISTS=on

# trace | debug | info | warn | error
LOG_LEVEL=info
EOF
  umask 022
  chmod 600 "$LIBREMOD_DIR/.env"
}

# Setzt fehlende Schlüssel in einer bestehenden .env (für Updates aus älteren Versionen).
env_default() {
  grep -qE "^$1=" "$LIBREMOD_DIR/.env" || printf '%s=%s\n' "$1" "$2" >>"$LIBREMOD_DIR/.env"
}
env_get() { grep -E "^$1=" "$LIBREMOD_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2-; }

write_compose() {
  cat >"$LIBREMOD_DIR/docker-compose.yml" <<'EOF'
# Libremod. Diese Datei wird bei „libremod update“ neu geschrieben, eigene Änderungen
# gehören in docker-compose.override.yml im selben Ordner.
name: libremod

x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  db:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-libremod}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD fehlt in .env}
      POSTGRES_DB: ${POSTGRES_DB:-libremod}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]
      interval: 5s
      retries: 20
    logging: *logging

  bot:
    image: ${LIBREMOD_IMAGE:-ghcr.io/libremod-bot/libremod}-bot:${LIBREMOD_VERSION:-latest}
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-libremod}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-libremod}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "dist/health.js"]
      interval: 30s
      timeout: 10s
      start_period: 3m
      retries: 3
    logging: *logging

  dashboard:
    image: ${LIBREMOD_IMAGE:-ghcr.io/libremod-bot/libremod}-dashboard:${LIBREMOD_VERSION:-latest}
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-libremod}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-libremod}
    # Nur auf diesem Server erreichbar. Nach außen geht es über HTTPS (Caddy oder dein Webserver).
    ports:
      - "127.0.0.1:${DASHBOARD_PORT:-3000}:3000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 1m
      retries: 3
    logging: *logging

  # Automatisches HTTPS mit Let's Encrypt. Nur aktiv mit COMPOSE_PROFILES=caddy in .env.
  caddy:
    image: caddy:2-alpine
    profiles: ["caddy"]
    restart: unless-stopped
    environment:
      DASHBOARD_DOMAIN: ${DASHBOARD_DOMAIN:-}
      ACME_EMAIL: ${ACME_EMAIL:-}
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - dashboard
    logging: *logging

volumes:
  db-data:
  caddy-data:
  caddy-config:
EOF

  # Caddy liest Domain und E-Mail aus der Umgebung. Ohne E-Mail fällt die Zeile weg.
  {
    if [[ -n $(env_get ACME_EMAIL) ]]; then
      printf '{\n\temail {$ACME_EMAIL}\n}\n\n'
    fi
    cat <<'EOF'
{$DASHBOARD_DOMAIN} {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	reverse_proxy dashboard:3000
}
EOF
  } >"$LIBREMOD_DIR/Caddyfile"
}

write_cli() {
  # Erst in eine neue Datei schreiben und dann austauschen: Ein gerade laufendes „libremod update“ liest sonst die halbe neue Datei.
  local tmp="$CLI_PATH.new"
  cat >"$tmp" <<'CLI'
#!/usr/bin/env bash
# libremod: Libremod verwalten (installiert vom Install-Skript). Hilfe: libremod help
set -Eeuo pipefail
DIR="${LIBREMOD_DIR:-/opt/libremod}"
SCRIPT_URL="${LIBREMOD_SCRIPT_URL:-https://raw.githubusercontent.com/libremod-bot/libremod/main/deploy/install.sh}"

if [[ -t 1 ]]; then B=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' GRN=$'\e[32m' YEL=$'\e[33m' R=$'\e[0m'; else B="" DIM="" RED="" GRN="" YEL="" R=""; fi
ok() { printf '%s✔%s %s\n' "$GRN" "$R" "$*"; }
warn() { printf '%s!%s %s\n' "$YEL" "$R" "$*" >&2; }
die() { printf '%s✘ %s%s\n' "$RED" "$*" "$R" >&2; exit 1; }

[[ -f $DIR/.env ]] || die "Keine Libremod-Installation in $DIR gefunden."
[[ $(id -u) -eq 0 ]] || exec sudo -E "$0" "$@"
cd "$DIR"

dc() { docker compose "$@"; }
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }
PGUSER=$(env_get POSTGRES_USER); PGUSER=${PGUSER:-libremod}
PGDB=$(env_get POSTGRES_DB); PGDB=${PGDB:-libremod}
psql_q() { dc exec -T db psql -U "$PGUSER" -d "$PGDB" -qAtX -v ON_ERROR_STOP=1 "$@"; }

confirm() {
  local answer
  [[ ${LIBREMOD_YES-} == 1 ]] && return 0
  printf '%s %s[j/N]%s: ' "$1" "$DIM" "$R"
  IFS= read -r answer </dev/tty || true
  [[ ${answer,,} == j* || ${answer,,} == y* ]]
}

register_commands() {
  local out
  if out=$(dc run --rm --no-deps -T bot node dist/deploy-commands.js 2>&1); then ok "Slash-Befehle bei Discord registriert"
  else warn "Slash-Befehle konnten nicht registriert werden: $(grep -m1 -E 'Error|Fehler' <<<"$out" || tail -n1 <<<"$out")"; fi
}

cmd_backup() {
  local quiet=0 keep file tmp size
  [[ ${1-} == --quiet ]] && quiet=1
  keep=$(env_get BACKUP_KEEP); [[ $keep =~ ^[0-9]+$ ]] || keep=14
  mkdir -p backups && chmod 700 backups
  file="backups/libremod-$(date +%Y-%m-%d-%H%M%S).dump"
  tmp="$file.part"
  if ! dc exec -T db pg_dump -U "$PGUSER" -d "$PGDB" -Fc >"$tmp"; then
    rm -f "$tmp"
    die "Sicherung fehlgeschlagen. Läuft die Datenbank? (libremod status)"
  fi
  mv "$tmp" "$file"
  chmod 600 "$file"
  size=$(stat -c %s "$file")
  ((size > 2147483647)) && size=2147483647
  psql_q -c "insert into instance_status (id, last_backup_at, last_backup_bytes) values (1, now(), $size)
    on conflict (id) do update set last_backup_at = excluded.last_backup_at, last_backup_bytes = excluded.last_backup_bytes" >/dev/null 2>&1 || true
  # Alte Sicherungen aufräumen (die neuesten $keep bleiben)
  ls -1t backups/libremod-*.dump 2>/dev/null | tail -n +$((keep + 1)) | xargs -r rm -f --
  ((quiet)) || ok "Gesichert: $DIR/$file ($(du -h "$file" | cut -f1)), behalten werden die letzten $keep"
}

cmd_restore() {
  local file=${1-}
  if [[ -z $file ]]; then
    echo "Vorhandene Sicherungen:"
    ls -1t backups/libremod-*.dump 2>/dev/null | head -n 20 | sed 's/^/  /' || true
    die "Bitte eine Datei angeben: libremod restore backups/libremod-….dump"
  fi
  [[ -f $file ]] || die "Datei nicht gefunden: $file"
  warn "Alle aktuellen Daten von Libremod werden durch den Stand aus $file ersetzt."
  confirm "Wirklich wiederherstellen?" || die "Abgebrochen."
  echo "Sichere zuerst den aktuellen Stand …"
  cmd_backup
  dc stop bot dashboard >/dev/null
  if dc exec -T db pg_restore -U "$PGUSER" -d "$PGDB" --clean --if-exists --no-owner --single-transaction --exit-on-error <"$file"; then
    ok "Wiederhergestellt aus $file"
  else
    warn "Wiederherstellung fehlgeschlagen, die Datenbank ist unverändert."
  fi
  dc up -d >/dev/null
  ok "Libremod läuft wieder"
}

cmd_update() {
  echo "Sichere vor dem Update …"
  cmd_backup
  local tmp
  tmp=$(mktemp)
  if curl -fsSL "$SCRIPT_URL" -o "$tmp" && head -n1 "$tmp" | grep -q bash; then
    LIBREMOD_DIR="$DIR" bash "$tmp" --update
  else
    warn "Neues Install-Skript nicht erreichbar, aktualisiere nur die Programme."
    dc pull -q && dc up -d --remove-orphans && register_commands
  fi
  rm -f "$tmp"
}

cmd_status() {
  dc ps --format 'table {{.Service}}\t{{.Status}}'
  echo
  local row
  row=$(psql_q -F '|' -c "select version, coalesce(extract(epoch from now() - heartbeat_at)::int, -1), guilds, ping_ms,
    coalesce(to_char(last_backup_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'), '') from instance_status where id = 1" 2>/dev/null || true)
  if [[ -z $row ]]; then
    warn "Der Bot hat sich noch nicht gemeldet."
    return
  fi
  IFS='|' read -r version age guilds ping backup <<<"$row"
  if ((age < 0)); then warn "Der Bot hat sich noch nicht gemeldet. Meldungen: libremod logs bot"
  elif ((age < 120)); then ok "Bot online, Version $version, auf $guilds Servern, Ping ${ping} ms"
  else warn "Bot offline (letzte Meldung vor $((age / 60)) Minuten). Meldungen: libremod logs bot"; fi
  if [[ -n $backup ]]; then ok "Letzte Sicherung: $backup"; else warn "Noch keine Sicherung (libremod backup)"; fi
  echo "${DIM}Dashboard: $(env_get DASHBOARD_URL)${R}"
}

cmd_uninstall() {
  warn "Libremod wird gestoppt und entfernt."
  confirm "Weiter?" || die "Abgebrochen."
  local purge=0
  confirm "Auch alle Daten löschen (Datenbank, Einstellungen, Sicherungen)? Das lässt sich nicht rückgängig machen." && purge=1
  if ((purge)); then dc --profile caddy down -v --remove-orphans; else dc --profile caddy down --remove-orphans; fi
  rm -f /etc/systemd/system/libremod-backup.service /etc/systemd/system/libremod-backup.timer /etc/cron.d/libremod
  command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload 2>/dev/null || true
  if ((purge)); then
    cd /
    rm -rf "$DIR"
    ok "Libremod und alle Daten sind entfernt."
  else
    ok "Libremod ist gestoppt. Datenbank (Docker-Volume libremod_db-data), .env und Sicherungen in $DIR bleiben erhalten."
  fi
  rm -f "$0"
  echo "Docker selbst bleibt installiert. Die Bot-Anwendung kannst du im Discord Developer Portal löschen."
}

help() {
  cat <<EOF
${B}libremod${R} – Libremod auf diesem Server verwalten

  libremod status              Zeigt, ob alles läuft
  libremod logs [bot|dashboard|db|caddy]
                               Meldungen ansehen (Strg+C beendet)
  libremod restart             Alles neu starten
  libremod stop | start        Anhalten bzw. wieder starten
  libremod update              Neueste Version holen (sichert vorher)
  libremod backup              Datenbank jetzt sichern (läuft auch jede Nacht automatisch)
  libremod restore <Datei>     Sicherung wiederherstellen
  libremod config              Einstellungen (.env) bearbeiten und neu starten
  libremod commands            Slash-Befehle erneut bei Discord registrieren
  libremod version             Installierte Version
  libremod uninstall           Libremod entfernen

Ordner: $DIR
EOF
}

case ${1-help} in
  status) cmd_status ;;
  logs) shift; dc logs -f --tail=200 "$@" ;;
  restart) dc up -d >/dev/null && dc restart && ok "Neu gestartet" ;;
  stop) dc stop && ok "Angehalten" ;;
  start) dc up -d && ok "Gestartet" ;;
  update) cmd_update ;;
  backup) shift; cmd_backup "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  config) ${EDITOR:-nano} .env && dc up -d && ok "Einstellungen übernommen" ;;
  commands) register_commands ;;
  version) dc exec -T bot node -p 'require("./package.json").version' 2>/dev/null || die "Der Bot läuft nicht." ;;
  uninstall) cmd_uninstall ;;
  help | -h | --help) help ;;
  *) help; exit 1 ;;
esac
CLI
  chmod 755 "$tmp"
  mv -f "$tmp" "$CLI_PATH"
}

install_backup_timer() {
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    cat >/etc/systemd/system/libremod-backup.service <<EOF
[Unit]
Description=Libremod Datensicherung
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=LIBREMOD_DIR=$LIBREMOD_DIR
ExecStart=$CLI_PATH backup --quiet
EOF
    cat >/etc/systemd/system/libremod-backup.timer <<'EOF'
[Unit]
Description=Libremod jede Nacht sichern

[Timer]
OnCalendar=*-*-* 03:30:00
RandomizedDelaySec=20m
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl daemon-reload
    systemctl enable --now libremod-backup.timer >/dev/null 2>&1
  else
    printf 'LIBREMOD_DIR=%s\n30 3 * * * root %s backup --quiet >/dev/null 2>&1\n' "$LIBREMOD_DIR" "$CLI_PATH" >/etc/cron.d/libremod
    chmod 644 /etc/cron.d/libremod
  fi
}

# --- Starten -----------------------------------------------------------------
dc() { docker compose --project-directory "$LIBREMOD_DIR" "$@"; }

health_of() { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$(dc ps -q "$1" 2>/dev/null)" 2>/dev/null || echo "fehlt"; }

wait_healthy() {
  local service=$1 timeout=$2 waited=0 state
  while ((waited < timeout)); do
    state=$(health_of "$service")
    [[ $state == healthy ]] && return 0
    [[ $state == exited || $state == dead ]] && return 1
    # Startet der Container ständig neu, lohnt das Warten nicht.
    (($(docker inspect -f '{{.RestartCount}}' "$(dc ps -q "$service")" 2>/dev/null || echo 0) >= 3)) && return 1
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

start_stack() {
  step "Lade Libremod herunter"
  local tries=0
  until dc pull -q; do
    tries=$((tries + 1))
    if ((tries >= 3)); then
      local img missing=0
      for img in $(dc config --images); do docker image inspect "$img" >/dev/null 2>&1 || missing=1; done
      ((missing)) && die "Die Programme konnten nicht heruntergeladen werden. Internetverbindung prüfen und das Skript erneut starten."
      warn "Herunterladen klappt gerade nicht, nutze die schon vorhandenen Versionen."
      break
    fi
    warn "Herunterladen fehlgeschlagen, neuer Versuch in 20 Sekunden …"
    sleep 20
  done
  ok "Aktuell"
  step "Starte Libremod"
  dc up -d --remove-orphans
  say "Warte, bis die Datenbank eingerichtet ist und der Bot sich bei Discord anmeldet …"
  if wait_healthy bot 240; then
    ok "Bot ist online"
  else
    warn "Der Bot meldet sich noch nicht als bereit. Die letzten Meldungen:"
    dc logs --tail=25 bot >&2 || true
    warn "Mehr mit: libremod logs bot"
  fi
  if wait_healthy dashboard 90; then ok "Dashboard läuft"; else warn "Das Dashboard antwortet noch nicht (libremod logs dashboard)."; fi
  local out
  if out=$(dc run --rm --no-deps -T bot node dist/deploy-commands.js 2>&1); then
    ok "Slash-Befehle bei Discord registriert (es kann bis zu einer Stunde dauern, bis alle überall sichtbar sind)"
  else
    warn "Slash-Befehle konnten nicht registriert werden: $(grep -m1 -E 'Error|Fehler' <<<"$out" || tail -n1 <<<"$out")"
    warn "Später erneut versuchen mit: libremod commands"
  fi
}

# --- Ablauf ------------------------------------------------------------------
install_packages curl jq
if ! command -v ss >/dev/null 2>&1 && is_apt; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iproute2 >/dev/null 2>&1 || true
fi

if [[ $MODE == install && -f $LIBREMOD_DIR/.env ]]; then
  say ""
  warn "Libremod ist in $LIBREMOD_DIR schon eingerichtet."
  if yesno "Nur aktualisieren? (Einstellungen und Daten bleiben)" j; then
    MODE=update
  else
    die "Abgebrochen. Zum Neu-Einrichten erst „libremod uninstall“ ausführen."
  fi
fi

ensure_docker

if [[ $MODE == update ]]; then
  [[ -f $LIBREMOD_DIR/.env ]] || die "Keine Installation in $LIBREMOD_DIR gefunden. Ohne --update starten."
  step "Aktualisiere Libremod in $LIBREMOD_DIR"
  env_default LIBREMOD_IMAGE "$LIBREMOD_IMAGE"
  env_default LIBREMOD_VERSION latest
  env_default BACKUP_KEEP 14
  env_default COMPOSE_PROFILES ""
  env_default DASHBOARD_DOMAIN ""
  env_default ACME_EMAIL ""
  write_compose
  write_cli
  install_backup_timer
  ok "Dateien aktualisiert"
  start_stack
  say ""
  ok "${B}Update fertig.${R} Dashboard: $(env_get DASHBOARD_URL)"
  exit 0
fi

mkdir -p "$LIBREMOD_DIR"
chmod 755 "$LIBREMOD_DIR"
ask_discord
ask_access
write_env
write_compose
write_cli
install_backup_timer
ok "Einstellungen gespeichert in $LIBREMOD_DIR/.env (nur für root lesbar)"
start_stack

INVITE="https://discord.com/oauth2/authorize?client_id=$DISCORD_CLIENT_ID&scope=bot%20applications.commands&permissions=$BOT_PERMISSIONS"
say ""
say "${GRN}${B}Libremod ist eingerichtet!${R}"
say ""
say "${B}Noch ein Schritt im Discord Developer Portal${R} (OAuth2 → Redirects → Add Redirect):"
say "    $DASHBOARD_URL/api/auth/callback"
say ""
say "${B}Bot auf deinen Server einladen:${R}"
say "    $INVITE"
say ""
say "${B}Dashboard:${R} $DASHBOARD_URL"
if [[ $ACCESS == 2 ]]; then
  say ""
  say "${B}Dein Webserver${R} muss $DOMAIN mit HTTPS an http://127.0.0.1:$DASHBOARD_PORT weiterleiten. Beispiel für nginx:"
  say "    location / {"
  say "        proxy_pass http://127.0.0.1:$DASHBOARD_PORT;"
  say "        proxy_set_header Host \$host;"
  say "        proxy_set_header X-Forwarded-Proto \$scheme;"
  say "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  say "    }"
  say "  Zertifikat z. B. mit: certbot --nginx -d $DOMAIN"
elif [[ $ACCESS == 3 ]]; then
  say "${DIM}Läuft Libremod auf einem anderen Rechner, öffne vorher einen Tunnel: ssh -L $DASHBOARD_PORT:localhost:$DASHBOARD_PORT <server>${R}"
fi
say ""
say "Verwalten mit dem Befehl ${B}libremod${R} (z. B. libremod status, libremod update). Jede Nacht wird automatisch gesichert."
say "Anleitung und Hilfe: https://github.com/libremod-bot/libremod/blob/main/docs/SELBSTHOSTEN.md"
