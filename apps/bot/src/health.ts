/**
 * Docker-Healthcheck: gesund, wenn der Bot in den letzten 2 Minuten mit Discord verbunden war.
 * Aufruf: node dist/health.js
 */
import { readFileSync } from "node:fs";

try {
  const last = Number(readFileSync("/tmp/libremod-heartbeat", "utf8"));
  process.exit(Date.now() - last < 120_000 ? 0 : 1);
} catch {
  process.exit(1);
}
