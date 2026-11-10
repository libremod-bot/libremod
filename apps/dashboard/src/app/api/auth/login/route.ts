import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/discord";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  session.oauthState = randomBytes(16).toString("hex");
  await session.save();
  return NextResponse.redirect(authorizeUrl(session.oauthState));
}
