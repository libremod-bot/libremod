import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/discord";
import { getSession } from "@/lib/session";

/** Nur bekannte Ziele innerhalb des Dashboards, damit niemand den Login für Weiterleitungen nach außen missbraucht. */
const SAFE_RETURN = /^\/appeal\/\d{17,20}$/;

export async function GET(request: NextRequest) {
  const session = await getSession();
  session.oauthState = randomBytes(16).toString("hex");
  const back = request.nextUrl.searchParams.get("weiter");
  session.returnTo = back && SAFE_RETURN.test(back) ? back : undefined;
  await session.save();
  return NextResponse.redirect(authorizeUrl(session.oauthState));
}
