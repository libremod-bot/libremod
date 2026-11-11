import type { LogCategory } from "@libremod/db";
import type { IconName } from "@/components/Icon";

/** Beschriftung der Log-Arten im Dashboard. */
export const LOG_INFO: Record<LogCategory, { label: string; icon: IconName; events: string[] }> = {
  messages: {
    label: "Nachrichten",
    icon: "message",
    events: ["Gelöschte Nachrichten mit Inhalt", "Bearbeitete Nachrichten (vorher und nachher)", "Massenlöschungen als Textdatei"],
  },
  members: {
    label: "Beitritte & Austritte",
    icon: "door",
    events: ["Neue Mitglieder mit Kontoalter", "Warnung bei Konten jünger als 7 Tage", "Austritte mit Rollen und Beitrittsdatum"],
  },
  member_updates: {
    label: "Mitglieder-Änderungen",
    icon: "usercog",
    events: ["Rollen hinzugefügt oder entfernt", "Spitznamen geändert", "Benutzer- und Anzeigenamen geändert"],
  },
  server: {
    label: "Server-Änderungen",
    icon: "server",
    events: ["Kanäle erstellt, gelöscht oder geändert", "Rollen erstellt, gelöscht oder geändert", "Rechte von Rollen und Kanälen"],
  },
  voice: {
    label: "Sprachkanäle",
    icon: "mic",
    events: ["Sprachkanal betreten", "Sprachkanal verlassen", "Sprachkanal gewechselt"],
  },
};
