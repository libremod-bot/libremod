import { fileURLToPath } from "node:url";
import { GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";

// Inter (SIL Open Font License, siehe assets/fonts/OFL.txt) liegt dem Bot bei, weil das Docker-Image keine Schriften hat.
let fontsReady = false;
export function ensureFonts() {
  if (fontsReady) return;
  for (const file of ["Inter_400Regular.ttf", "Inter_700Bold.ttf"]) {
    GlobalFonts.registerFromPath(
      fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url)),
      "Inter",
    );
  }
  fontsReady = true;
}

export const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Emojis kann die beigelegte Schrift nicht darstellen, sie würden als Kästchen erscheinen. */
export const clean = (s: string) =>
  s
    .replace(
      /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

/** Text so weit kürzen, dass er in die Breite passt. */
export function fit(ctx: SKRSContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let tItem = text;
  while (tItem.length > 1 && ctx.measureText(`${tItem}…`).width > maxWidth)
    tItem = tItem.slice(0, -1);
  return `${tItem}…`;
}

/** Runder Avatar mit farbigem Rand, ohne Bild der erste Buchstabe. */
export async function drawAvatar(
  ctx: SKRSContext2D,
  url: string | null,
  name: string,
  cx: number,
  cy: number,
  size: number,
  accent: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const avatar = url ? await loadImage(url).catch(() => null) : null;
  if (avatar) {
    ctx.drawImage(avatar, cx - size / 2, cy - size / 2, size, size);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = "#0d1017";
    ctx.font = `bold ${Math.round(size * 0.47)}px Inter`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((clean(name)[0] ?? "?").toUpperCase(), cx, cy + size * 0.02);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 3, 0, Math.PI * 2);
  ctx.stroke();
}

/** Dunkler Hintergrund mit abgerundeten Ecken und farbigem Schimmer. */
export function drawBackground(
  ctx: SKRSContext2D,
  w: number,
  h: number,
  accent: string,
  glowX: number,
  glowY: number,
) {
  roundRect(ctx, 0, 0, w, h, 28);
  ctx.save();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#151a24");
  bg.addColorStop(1, "#0d1017");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, 360);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, `${accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
