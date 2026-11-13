import { eq, guildSettings, logChannels, suggestionSettings, welcomeSettings } from "@libremod/db";
import { notFound } from "next/navigation";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels } from "@/lib/discord";
import { t, initLocale } from "@/lib/i18n";
import { applySetup } from "../actions";
import { SetupWizard } from "./SetupWizard";

export async function generateMetadata() {
  await initLocale();
  return { title: t("{n0} · Libremod", { n0: t("Einrichtungs-Assistent") }) };
}

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { guildId } = await params;
  const { access } = await requireGuildAccess(guildId);
  if (!access.full) notFound();
  const { fehler } = await searchParams;
  const { db } = database();
  const [[gs], logs, [welcome], [sugg], channels] = await Promise.all([
    db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)),
    db.select().from(logChannels).where(eq(logChannels.guildId, guildId)),
    db.select().from(welcomeSettings).where(eq(welcomeSettings.guildId, guildId)),
    db.select().from(suggestionSettings).where(eq(suggestionSettings.guildId, guildId)),
    getGuildChannels(guildId),
  ]);
  const text = channels
    .filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT)
    .map((c) => ({ id: c.id, name: c.name ?? c.id }));
  // Kanäle mit passendem Namen vorschlagen, wenn noch nichts eingestellt ist.
  const guess = (...words: string[]) => text.find((c) => words.some((w) => c.name.toLowerCase().includes(w)))?.id ?? "";

  return (
    <>
      <PageHeader
        icon="sparkle"
        title={t("Einrichtungs-Assistent")}
        description={t("In fünf kurzen Schritten ist Libremod passend für deinen Server eingestellt. Danach kannst du alles im Detail anpassen.")}
      />
      <Notice error={fehler} />
      <SetupWizard
        action={applySetup.bind(null, guildId)}
        channels={text}
        defaults={{
          modLogChannelId: gs?.modLogChannelId ?? guess("mod-log", "modlog", "mod-logs"),
          logChannelId: logs[0]?.channelId ?? guess("server-log", "serverlog", "logs"),
          welcomeChannelId: welcome?.welcomeChannelId ?? guess("willkommen", "welcome", "allgemein", "general"),
          suggestionChannelId: sugg?.channelId ?? guess("vorschl", "suggest", "ideen", "ideas"),
        }}
      />
    </>
  );
}
