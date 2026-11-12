import { createCanvas } from "@napi-rs/canvas";
import {
  clean,
  drawAvatar,
  drawBackground,
  ensureFonts,
  fit,
  hex,
} from "./canvas.js";
import { t } from "@libremod/shared";

export interface WelcomeCardData {
  title: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
  color: number;
}

const W = 1000;
const H = 400;
const nf = new Intl.NumberFormat("de-DE");

/** Begrüßungsbild: Avatar oben in der Mitte, darunter Überschrift, Name und Mitgliedsnummer. */
export async function renderWelcomeCard(d: WelcomeCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = hex(d.color);
  drawBackground(ctx, W, H, accent, W / 2, 0);
  await drawAvatar(ctx, d.avatarUrl, d.name, W / 2, 120, 170, accent);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 50px Inter";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    fit(ctx, clean(d.title) || t("Willkommen!"), W - 120),
    W / 2,
    285,
  );
  ctx.font = "bold 32px Inter";
  ctx.fillStyle = accent;
  ctx.fillText(
    fit(ctx, clean(d.name) || t("Neues Mitglied"), W - 160),
    W / 2,
    333,
  );
  ctx.font = "24px Inter";
  ctx.fillStyle = "#9aa4b5";
  ctx.fillText(
    t("Mitglied #{n0}", { n0: nf.format(d.memberCount) }),
    W / 2,
    372,
  );
  return canvas.toBuffer("image/png");
}
