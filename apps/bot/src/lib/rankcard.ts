import { createCanvas } from "@napi-rs/canvas";
import { compactNumber } from "@libremod/shared";
import {
  clean,
  drawAvatar,
  drawBackground,
  ensureFonts,
  fit,
  hex,
  roundRect,
} from "./canvas.js";
import { t } from "@libremod/shared";

export interface RankCardData {
  name: string;
  username: string;
  avatarUrl: string | null;
  level: number;
  rank: number | null;
  current: number;
  needed: number;
  totalXp: number;
  color: number;
  season?: number | null;
}

const W = 934;
const H = 282;

export async function renderRankCard(d: RankCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = hex(d.color);

  drawBackground(ctx, W, H, accent, W - 120, 40);
  await drawAvatar(ctx, d.avatarUrl, d.name, 48 + 90, 51 + 90, 180, accent);

  const left = 270;
  const right = W - 48;
  ctx.textBaseline = "alphabetic";

  // Rang und Level oben rechts
  ctx.textAlign = "right";
  let x = right;
  const stat = (label: string, value: string, color: string) => {
    ctx.font = t("bold 54px Inter");
    ctx.fillStyle = color;
    ctx.fillText(value, x, 92);
    x -= ctx.measureText(value).width + 10;
    ctx.font = t("26px Inter");
    ctx.fillStyle = "#9aa4b5";
    ctx.fillText(label, x, 92);
    x -= ctx.measureText(label).width + 30;
  };
  stat("LEVEL", String(d.level), accent);
  if (d.rank) stat("RANG", `#${d.rank}`, "#ffffff");

  // Name
  ctx.textAlign = "left";
  ctx.font = t("bold 40px Inter");
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, clean(d.name) || d.username, right - left), left, 160);
  ctx.font = t("24px Inter");
  ctx.fillStyle = "#9aa4b5";
  const sub = d.season
    ? t("@{username} · Saison {season}", {
        username: d.username,
        season: d.season,
      })
    : `@${d.username}`;
  ctx.fillText(fit(ctx, sub, right - left - 260), left, 196);

  // XP rechts neben dem Namen
  ctx.textAlign = "right";
  ctx.font = t("bold 26px Inter");
  ctx.fillStyle = "#ffffff";
  const xpText = t("{current} / {needed} XP", {
    current: compactNumber(d.current),
    needed: compactNumber(d.needed),
  });
  ctx.fillText(xpText, right, 196);

  // Fortschrittsbalken
  const by = 214;
  const bh = 34;
  roundRect(ctx, left, by, right - left, bh, bh / 2);
  ctx.fillStyle = "#262d3b";
  ctx.fill();
  const share = Math.max(0, Math.min(1, d.current / Math.max(1, d.needed)));
  if (share > 0) {
    roundRect(ctx, left, by, Math.max(bh, (right - left) * share), bh, bh / 2);
    const bar = ctx.createLinearGradient(left, 0, right, 0);
    bar.addColorStop(0, accent);
    bar.addColorStop(1, `${accent}bb`);
    ctx.fillStyle = bar;
    ctx.fill();
  }

  return canvas.toBuffer("image/png");
}
