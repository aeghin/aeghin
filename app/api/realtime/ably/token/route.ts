import { NextRequest, NextResponse } from "next/server";
import * as Ably from "ably";
import { getChatAccess } from "@/lib/services/chat";
import { channelName } from "@/lib/realtime/channels";

// proxy.ts does NOT match /api — so this route authorizes itself.
// Keep on the default Node runtime (Ably Rest + Prisma/pg need Node).
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const ctx = await getChatAccess(eventId);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

  // Capability-scoped to THIS event's channel. `subscribe` already permits
  // reading the presence set; `presence` is what grants ENTERing it — so
  // preview-only admins watch the room without joining it.
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: ctx.user.id,
    capability: JSON.stringify({
      [channelName(eventId)]: ctx.canPost
        ? ["subscribe", "presence"]
        : ["subscribe"],
    }),
  });

  return NextResponse.json(tokenRequest);
}
