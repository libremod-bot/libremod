import "server-only";
import { cookies } from "next/headers";

export const THEME_COOKIE = "libremod_theme";
export type Theme = "light" | "dark";
export const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";

/** Gewähltes Farbschema oder null (dann gilt die Einstellung des Systems). */
export async function currentTheme(): Promise<Theme | null> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(v) ? v : null;
}
