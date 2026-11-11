import type { ShopItem } from "@libremod/db";
import type { GuildRole } from "@/lib/discord";

export function ItemFields({ item, roles, botTop }: { item?: ShopItem; roles: GuildRole[]; botTop: number }) {
  return (
    <>
      <div className="grid-3">
        <div>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" required maxLength={60} defaultValue={item?.name ?? ""} placeholder="z. B. VIP-Rolle" />
        </div>
        <div>
          <label htmlFor="price">Preis</label>
          <input id="price" name="price" type="number" required min={1} max={1_000_000_000} defaultValue={item?.price ?? 500} />
        </div>
        <div>
          <label htmlFor="stock">Bestand (leer = unbegrenzt)</label>
          <input id="stock" name="stock" type="number" min={0} max={1_000_000} defaultValue={item?.stock ?? ""} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: "1rem" }}>
        <div className="field">
          <label htmlFor="description">Beschreibung</label>
          <input id="description" name="description" type="text" maxLength={200} defaultValue={item?.description ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="roleId">Rolle beim Kauf (optional)</label>
          <select id="roleId" name="roleId" defaultValue={item?.roleId ?? ""}>
            <option value="">Keine</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id} disabled={r.position >= botTop}>
                @{r.name}
                {r.position >= botTop ? " (steht über Libremod)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="replyMessage">Text nach dem Kauf (optional)</label>
        <input
          id="replyMessage"
          name="replyMessage"
          type="text"
          maxLength={500}
          defaultValue={item?.replyMessage ?? ""}
          placeholder="z. B. Öffne ein Ticket, um deinen Gewinn einzulösen."
        />
      </div>
    </>
  );
}
