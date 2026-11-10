# Libremod Dashboard

Web-Oberfläche mit Discord-Login, über die Server-Admins Libremod einstellen. Läuft unter https://dashboard.libremod.xyz, lässt sich aber genauso selbst hosten (siehe README im Hauptordner).

Entwicklung: `pnpm --filter @libremod/dashboard dev` startet das Dashboard auf http://localhost:3000. Dafür in der `.env` im Hauptordner zusätzlich `DISCORD_CLIENT_SECRET`, `SESSION_SECRET` und `DASHBOARD_URL=http://localhost:3000` setzen und im Discord Developer Portal unter **OAuth2 → Redirects** `http://localhost:3000/api/auth/callback` eintragen.
