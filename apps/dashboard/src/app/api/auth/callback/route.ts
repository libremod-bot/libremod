import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, getCurrentUser } from "@/lib/discord";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const session = await getSession();
  const expectedState = session.oauthState;
  session.oauthState = undefined;

  if (!code || !state || state !== expectedState) {
    await session.save();
    return NextResponse.redirect(`${env.dashboardUrl}/?fehler=login`);
  }

  try {
    const token = await exchangeCode(code);
    const user = await getCurrentUser(token.access_token);
    session.user = { id: user.id, username: user.global_name ?? user.username, avatar: user.avatar };
    session.accessToken = token.access_token;
    session.expiresAt = Date.now() + token.expires_in * 1000;
    await session.save();
    return NextResponse.redirect(`${env.dashboardUrl}/servers`);
  } catch {
    await session.save();
    return NextResponse.redirect(`${env.dashboardUrl}/?fehler=login`);
  }
}
