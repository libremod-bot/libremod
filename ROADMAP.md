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

## Später

### Moderation und Sicherheit

- Notizen zu Mitgliedern, die nur das Team sieht
- Mod-Statistik: wer im Team wie viele Fälle bearbeitet hat
- Massenaktionen: mehrere Mitglieder auf einmal bannen oder stummschalten
- Verifizierung neuer Mitglieder per Button, optional mit Captcha im Dashboard
- Schutz vor Konten mit verdächtigen Namen (z. B. Nachahmung von Teammitgliedern)
- Sperre („Lockdown“) für einzelne oder alle Kanäle mit einem Befehl
- Anti-Phishing: bekannte Betrugslinks automatisch entfernen
- Einspruch gegen Bans über ein Formular im Dashboard

### Community

- Vorschläge-Kanal mit Abstimmung und Status (angenommen, abgelehnt)
- Event-Planer mit Zu- und Absagen und Erinnerung vor Beginn
- Zitate speichern und zufällig wieder hervorholen
- Rollen mit Ablaufdatum, z. B. 30 Tage VIP
- Zähl-Spiel und Wortketten-Kanal
- Begrüßungsbild mit Avatar (aus 0.4, noch offen)
- Sprachkanal-Rolle (aus 0.4, noch offen)

### Level und Währung

- Level-Karten als Bild für `/rank`
- Doppelte XP an Wochenenden oder für bestimmte Rollen
- Saisons: Rangliste regelmäßig zurücksetzen, Ergebnisse archivieren
- Belohnungen in Währung für Level-Aufstiege

### Dashboard und Bedienung

- Änderungsprotokoll im Dashboard: wer hat wann welche Einstellung geändert
- Team-Zugänge: Moderatoren bekommen nur Zugriff auf bestimmte Seiten
- Einstellungen exportieren und auf einem anderen Server importieren
- Server-Statistik: Mitgliederentwicklung, aktivste Kanäle und Uhrzeiten
- Mehrsprachigkeit: Bot und Dashboard auch auf Englisch
- Embed-Editor mit Live-Vorschau für alle Nachrichten
- Eigener Name und Avatar des Bots pro Server, soweit Discord das erlaubt (beim Selbsthosten ohnehin frei wählbar)

### Betrieb und Selbsthosten

- Fertiges Docker-Image auf GitHub, Update mit einem Befehl
- Automatische Datenbank-Sicherungen mit Aufbewahrungsdauer
- Statusseite und Gesundheitsprüfung für Selbsthoster

## Dashboard

Alles oben Genannte wird über das Web-Dashboard einstellbar sein. Das Dashboard entsteht parallel ab Version 0.1.
