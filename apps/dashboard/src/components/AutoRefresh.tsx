"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Lädt die Seite regelmäßig neu, z. B. solange ein Update läuft. */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
