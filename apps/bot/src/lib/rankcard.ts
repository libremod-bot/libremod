import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { compactNumber } from "@libremod/shared";

// Inter (SIL Open Font License, siehe assets/fonts/OFL.txt) liegt dem Bot bei, weil das Docker-Image keine Schriften hat.
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  for (const file of ["Inter_400Regular.ttf", "Inter_700Bold.ttf"]) {
    GlobalFonts.registerFromPath(fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url)), "Inter");
  }
  fontsReady = true;
}

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
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Emojis kann die beigelegte Schrift nicht darstellen, sie würden als Kästchen erscheinen. */
const clean = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

/** Text so weit kürzen, dass er in die Breite passt. */
function fit(ctx: SKRSContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderRankCard(d: RankCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const accent = hex(d.color);

  // Hintergrund
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.save();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#151a24");
  bg.addColorStop(1, "#0d1017");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 120, 40, 10, W - 120, 40, 360);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Avatar
  const ax = 48;
  const ay = 51;
  const as = 180;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + as / 2, ay + as / 2, as / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const avatar = d.avatarUrl ? await loadImage(d.avatarUrl).catch(() => null) : null;
  if (avatar) {
    ctx.drawImage(avatar, ax, ay, as, as);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(ax, ay, as, as);
    ctx.fillStyle = "#0d1017";
    ctx.font = "bold 84px Inter";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((d.name.trim()[0] ?? "?").toUpperCase(), ax + as / 2, ay + as / 2 + 4);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(ax + as / 2, ay + as / 2, as / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();

  const left = 270;
  const right = W - 48;
  ctx.textBaseline = "alphabetic";

  // Rang und Level oben rechts
  ctx.textAlign = "right";
  let x = right;
  const stat = (label: string, value: string, color: string) => {
    ctx.font = "bold 54px Inter";
    ctx.fillStyle = color;
    ctx.fillText(value, x, 92);
    x -= ctx.measureText(value).width + 10;
    ctx.font = "26px Inter";
    ctx.fillStyle = "#9aa4b5";
    ctx.fillText(label, x, 92);
    x -= ctx.measureText(label).width + 30;
  };
  stat("LEVEL", String(d.level), accent);
  if (d.rank) stat("RANG", `#${d.rank}`, "#ffffff");

  // Name
  ctx.textAlign = "left";
  ctx.font = "bold 40px Inter";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, clean(d.name) || d.username, right - left), left, 160);
  ctx.font = "24px Inter";
  ctx.fillStyle = "#9aa4b5";
  const sub = d.season ? `@${d.username} · Saison ${d.season}` : `@${d.username}`;
  ctx.fillText(fit(ctx, sub, right - left - 260), left, 196);

  // XP rechts neben dem Namen
  ctx.textAlign = "right";
  ctx.font = "bold 26px Inter";
  ctx.fillStyle = "#ffffff";
  const xpText = `${compactNumber(d.current)} / ${compactNumber(d.needed)} XP`;
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
