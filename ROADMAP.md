# Roadmap

Alle Funktionen sind und bleiben für jeden Server kostenlos. Es gibt keine Premium-Stufen und keine künstlichen Mengenlimits. Grenzen gibt es nur dort, wo Discord selbst welche setzt oder wo sie Missbrauch verhindern.

Die Reihenfolge ist ein Vorschlag und kann sich ändern.

## 0.1 Moderation

- Befehle: `/ban`, `/unban`, `/kick`, `/timeout`, `/warn`, `/purge` (Nachrichten aufräumen)
- Fallakte pro Mitglied: Verwarnungen und Strafen mit Grund, Moderator und Zeitpunkt
- Befristete Bans, die automatisch auslaufen
- Mod-Log-Kanal mit einer Meldung pro Aktion
- Verwarnungsstufen: nach X Verwarnungen automatisch Timeout, Kick oder Ban

## 0.2 Auto-Moderation

- Filter für Spam, Einladungslinks, fremde Links, Wortlisten, Großbuchstaben und Massen-Erwähnungen
- Pro Filter wählbare Reaktion: löschen, verwarnen, Timeout, Kick oder Ban
- Eigener Hinweistext pro Filter, den die betroffene Person sieht
- Ausnahmen für Rollen und Kanäle
- Schutz vor Raids (viele neue Mitglieder in kurzer Zeit)

## 0.3 Logging

- Gelöschte und bearbeitete Nachrichten
- Beitritte, Austritte, Namens- und Rollenänderungen
- Kanal-, Rollen- und Sprachkanal-Ereignisse
- Jede Log-Art in einen eigenen Kanal leitbar, Meldungen in Echtzeit

## 0.4 Begrüßung und Rollen

- Willkommens- und Abschiedsnachrichten mit Platzhaltern und eigenem Embed
- Automatische Rollen beim Beitritt
- Selbstvergabe von Rollen per Reaktion, Button oder Auswahlmenü
- Begrüßungsbild mit Avatar und Servername, Hintergrund und Text frei wählbar
- Sprachkanal-Rolle: Wer in einem Sprachkanal ist, bekommt eine Rolle und sieht den passenden Textkanal

## 0.5 Community

- Level-System für Text- und Sprachaktivität mit frei einstellbaren XP-Werten und Rollenbelohnungen
- Eigene Befehle mit Antworttexten oder Embeds, auf Wunsch mit mehreren Antworten im Zufallswechsel
- Highlight-Kanal: Nachrichten mit vielen Reaktionen werden dort gesammelt
- Embed-Editor und zeitgesteuerte Nachrichten
- Zähler-Kanäle (Mitglieder, Ziele und mehr)
- Temporäre Sprachkanäle, die sich nach Gebrauch selbst löschen
- Kanäle automatisch in festen Abständen leeren
- Automatischer Langsam-Modus, der sich nach der Aktivität im Kanal richtet

## 0.6 Benachrichtigungen

- Neue Videos und Livestreams (YouTube, Twitch, Kick); TikTok, sobald es dafür eine offene Schnittstelle gibt
- Neue Beiträge aus Reddit-Communities
- RSS-Feeds

## 0.7 Tickets

- Ticket-System mit Ticket-Arten, Formularfragen, Panels (Buttons oder Menü), eigenem Kanal oder privatem Thread, Team-Rollen, Übernahme, Transkripten im Dashboard, Bewertungen und automatischem Schließen

## 0.8 Server-Währung

- Eigene Währung pro Server mit frei wählbarem Namen und Symbol
- Täglicher Bonus, Arbeiten, Überweisen und Rangliste
- Shop mit Rollen und eigenen Artikeln, verwaltet im Dashboard

## 0.9 Community-Klassiker

- Gewinnspiele mit Teilnahme per Button, Bedingungen (Rolle, Level), fairer Auslosung und Neu-Auslosen
- Umfragen über die eingebaute Umfrage-Funktion von Discord, mit Laufzeit und Mehrfachauswahl
- Erinnerungen mit `/remind`, im Kanal oder per Direktnachricht
- Geburtstage mit Glückwunsch, Altersanzeige und Geburtstagsrolle für einen Tag

## 0.10 Mehr Schutz

- Verifizierung neuer Mitglieder per Knopf, abgetipptem Code oder eigener Frage, mit Mindestalter für Konten und Rauswurf nach Frist
- Lockdown für einzelne Kanäle oder den ganzen Server, auf Wunsch befristet, alte Rechte werden wiederhergestellt
- Team-Notizen zu Mitgliedern, im Chat und in der Fallakte
- Team-Statistik: wer wie viele Fälle bearbeitet hat

## 0.11 Mitmachen

- Vorschläge-Kanal mit Abstimmung per Knopf, Status (offen, wird überlegt, angenommen, abgelehnt, umgesetzt), Begründung und Nachricht an den Verfasser
- Rollen mit Ablaufdatum, von Hand oder als Shop-Artikel, erneuter Kauf verlängert
- Zähl-Kanal mit Rekord, Neustart bei Fehlern und Schutz gegen doppeltes Zählen

## 0.12 Level und Währung

- Rang-Karte als Bild für `/rank` mit Avatar, Rang, Fortschritt und eigener Farbe
- XP-Bonus am Wochenende und für bestimmte Rollen (0 bis 500 %)
- Münzen für jeden Level-Aufstieg, Platzhalter `{coins}` in der Ansage
- Saisons: monatlich oder vierteljährlich neu starten, die besten 10 kommen in die Ruhmeshalle, `/leaderboard saison:`

## 0.13 Kleine Extras

- Begrüßungsbild mit Profilbild, Name und Mitgliedsnummer, Überschrift und Farbe frei wählbar
- Rolle im Sprachkanal: solange jemand mitredet, für einen bestimmten oder jeden Sprachkanal
- Wortketten-Kanal mit Rekord, ohne doppelte Wörter
- Zitate speichern per Rechtsklick oder `/quote add`, zufällig wieder hervorholen, im Dashboard durchsuchen

## 0.14 Mehr Moderation

- Anti-Phishing als Auto-Mod-Filter: erkennt nachgemachte Discord-, Steam- und andere Links, eigene Sperrliste
- Anti-Phishing erweitert: getarnte Markdown-Links, Links ohne https://, Punycode-Doppelgänger, Kurzlinks (abgesichert aufgelöst), typische Betrugstexte, gekaperte Konten (gleicher Link in mehreren Kanälen), Sperren und Freigeben per Knopf im Mod-Log oder Rechtsklick
- Anti-Phishing: zwei freie öffentliche Betrugslink-Listen (MIT und Unlicense) als Zusatz, alle 6 Stunden geladen, lokal abgeglichen, pro Server abschaltbar
- Namensschutz: greift ein, wenn jemand heißt wie Team, Inhaber oder Bot (auch mit Tricks wie „Mlchel“)
- Massenaktionen `/massban`, `/masskick`, `/masstimeout` per Liste oder „alle, die in den letzten X Minuten beigetreten sind“, mit Bestätigung
- Einspruch gegen Bans über eine eigene Seite im Dashboard, Link in der Ban-Nachricht, Entscheidung durch das Team

## 0.15 Events

- Event-Planer: `/event create/cancel/list` und Dashboard-Seite, Zu-, Ab- und Vielleicht-Antworten per Knopf, begrenzte Plätze mit Warteliste und automatischem Nachrücken, Event-Rolle für alle Zusagen (danach wieder entfernt), Erinnerung per DM vor Beginn, Absage mit Benachrichtigung

## 0.16 Verwaltung

- Team-Zugänge: Discord-Rollen bekommen Zugriff auf einzelne Dashboard-Bereiche, ohne „Server verwalten“
- Änderungsprotokoll: wer hat wann im Dashboard was geändert, filterbar nach Bereich und Person
- Export und Import aller Einstellungen als JSON-Datei, auch auf einen anderen Server (unbekannte Kanäle und Rollen werden entfernt)
- Server-Statistik: Mitgliederentwicklung, Nachrichten, Beitritte und Abgänge, aktivste Kanäle und Uhrzeiten (nur Zahlen, keine Nutzerdaten)

## 0.17 Embed-Editor

- Karten (Embeds) gestalten mit Live-Vorschau im Discord-Stil: Überschrift, Farbe, Zeile darüber, Fußzeile, Uhrzeit, Felder, kleines und großes Bild
- Für Begrüßung, Abschied, geplante Nachrichten und eigene Befehle, Platzhalter in allen Texten

## 0.18 Selbsthosten

- Install-Skript für Debian und Ubuntu: fragt alles ab, prüft die Discord-Zugangsdaten, richtet Docker, Datenbank und HTTPS ein
- Fertige Docker-Images auf GitHub (amd64 und arm64)
- Befehl `libremod` auf dem Server: Status, Update mit einem Befehl, Logs, Sicherung, Wiederherstellung, Deinstallation
- Tägliche Datenbank-Sicherung mit Aufbewahrungsdauer
- Statusseite im Dashboard für die Besitzer der Installation, Gesundheitsprüfung für Docker, Neustart bei Verbindungsverlust
- Anleitung: [docs/SELBSTHOSTEN.md](docs/SELBSTHOSTEN.md)

## 0.19 Englisch

- Bot und Dashboard auf Deutsch und Englisch
- Der Bot antwortet pro Server in der eingestellten Sprache (beim Beitritt aus der Discord-Sprache des Servers übernommen, im Dashboard unter „Übersicht“ änderbar), auch in Logs, Begrüßungen, Erinnerungen und Transkripten
- Slash-Befehle erscheinen in Discord in der Sprache, die jede Person selbst eingestellt hat
- Dashboard mit Sprachumschalter DE/EN, ohne Auswahl nach Browser-Sprache
- Events verstehen auch englische Zeitangaben wie „tomorrow 7:30 pm“
- `pnpm i18n:check` findet Texte ohne Übersetzung

## 0.20 Updates ohne Kommandozeile

- Der Bot sieht einmal am Tag nach, ob es eine neue Version gibt, die Statusseite im Dashboard zeigt sie an
- Update per Knopfdruck im Dashboard, mit Sicherung vorher, Fortschritt und Ergebnis
- Automatische Updates nachts (alle 24 oder 48 Stunden), im Install-Skript und im Dashboard wählbar
- Auf Wunsch automatische Sicherheitsupdates für System und Docker (Debian, Ubuntu)
- Neuer Befehl `libremod autoupdate`

## Später

Ideen und Wünsche gerne als Issue auf GitHub.

## Dashboard

Alles oben Genannte wird über das Web-Dashboard einstellbar sein. Das Dashboard entsteht parallel ab Version 0.1.
