import type { ShopItem } from "@libremod/db";
import type { GuildRole } from "@/lib/discord";
import { t } from "@/lib/i18n";

export function ItemFields({ item, roles, botTop }: { item?: ShopItem; roles: GuildRole[]; botTop: number }) {
  return (
    <>
      <div className="grid-3">
        <div>
          <label htmlFor="name">{t("Name")}</label>
          <input id="name" name="name" type="text" required maxLength={60} defaultValue={item?.name ?? ""} placeholder={t("z. B. VIP-Rolle")} />
        </div>
        <div>
          <label htmlFor="price">{t("Preis")}</label>
          <input id="price" name="price" type="number" required min={1} max={1_000_000_000} defaultValue={item?.price ?? 500} />
        </div>
        <div>
          <label htmlFor="stock">{t("Bestand (leer = unbegrenzt)")}</label>
          <input id="stock" name="stock" type="number" min={0} max={1_000_000} defaultValue={item?.stock ?? ""} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="description">{t("Beschreibung")}</label>
          <input id="description" name="description" type="text" maxLength={200} defaultValue={item?.description ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="roleId">{t("Rolle beim Kauf (optional)")}</label>
          <select id="roleId" name="roleId" defaultValue={item?.roleId ?? ""}>
            <option value="">{t("Keine")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id} disabled={r.position >= botTop}>
                @{r.name}
                {r.position >= botTop ? t(" (steht über Libremod)") : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="roleDays">{t("Rolle für Tage (leer = dauerhaft)")}</label>
          <input id="roleDays" name="roleDays" type="number" min={1} max={366} defaultValue={item?.roleDays ?? ""} placeholder="z. B. 30" />
          <div className="hint">{t("Mit Tagen läuft die Rolle danach ab. Ein erneuter Kauf verlängert sie.")}</div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="replyMessage">{t("Text nach dem Kauf (optional)")}</label>
        <input
          id="replyMessage"
          name="replyMessage"
          type="text"
          maxLength={500}
          defaultValue={item?.replyMessage ?? ""}
          placeholder={t("z. B. Öffne ein Ticket, um deinen Gewinn einzulösen.")}
        />
      </div>
    </>
  );
}
