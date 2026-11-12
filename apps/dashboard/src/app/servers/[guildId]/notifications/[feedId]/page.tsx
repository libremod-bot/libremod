import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, notificationFeeds } from "@libremod/db";
import { PLATFORM_INFO } from "@libremod/shared";
import { Icon } from "@/components/Icon";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/PageHeader";
import { requireGuildAccess } from "@/lib/access";
import { database } from "@/lib/db";
import { CHANNEL_ANNOUNCEMENT, CHANNEL_TEXT, getGuildChannels, getGuildRoles } from "@/lib/discord";
import { updateFeed } from "../../actions";
import { FeedFields } from "../FeedFields";

export const metadata = { title: "Benachrichtigung bearbeiten · Libremod" };

export default async function EditFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string; feedId: string }>;
  searchParams: Promise<{ gespeichert?: string; fehler?: string }>;
}) {
  const { guildId, feedId } = await params;
  await requireGuildAccess(guildId, "notifications");
  const { gespeichert, fehler } = await searchParams;
  const id = Number(feedId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db } = database();
  const [[feed], channels, roles] = await Promise.all([
    db.select().from(notificationFeeds).where(and(eq(notificationFeeds.id, id), eq(notificationFeeds.guildId, guildId))),
    getGuildChannels(guildId),
    getGuildRoles(guildId),
  ]);
  if (!feed) notFound();
  const textChannels = channels.filter((c) => c.type === CHANNEL_TEXT || c.type === CHANNEL_ANNOUNCEMENT);
  const info = PLATFORM_INFO[feed.platform];

  return (
    <>
      <PageHeader
        icon="bell"
        title={`${feed.platform === "reddit" ? `r/${feed.sourceId}` : feed.name} bearbeiten`}
        description={`${info.label}-Benachrichtigung. Die Quelle selbst lässt sich nicht ändern, lege dafür eine neue an.`}
      />
      <Notice saved={gespeichert} error={fehler} />
      <Link href={`/servers/${guildId}/notifications`} className="small back-link">
        <Icon name="back" size={15} /> Zurück zu den Benachrichtigungen
      </Link>
      <div className="card">
        <form action={updateFeed.bind(null, guildId, feed.id)}>
          <FeedFields
            guildId={guildId}
            textChannels={textChannels}
            roles={roles}
            channelId={feed.channelId}
            mentionRoleId={feed.mentionRoleId}
            message={feed.message}
            messagePlaceholder={info.defaultMessage}
          />
          <div style={{ marginTop: "1rem" }}>
            <button type="submit">Speichern</button>
          </div>
        </form>
      </div>
    </>
  );
}
