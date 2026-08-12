import { createAgentUIStreamResponse } from "ai";
import { currentUser } from "@/lib/services/user";
import { getUserMembershipRole } from "@/lib/services/organization";
import { getEventDetailsById } from "@/lib/services/events";
import { getOrganizationSongs } from "@/lib/services/songs";
import { getAiSetlistAccess, getAiProAccess } from "@/lib/billing/entitlements";
import { OrgRole } from "@/generated/prisma/enums";
import { createSetlistAgent } from "@/lib/agents/setlist/agent";


export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, eventId, orgId } = await req.json();
  if (typeof eventId !== "string" || typeof orgId !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });


  const [hasPro, hasPremium] = await Promise.all([
    getAiProAccess({ userId: user.id, orgId }),
    getAiSetlistAccess({ userId: user.id, orgId })
  ]);

  if (!hasPro && !hasPremium) return new Response("Upgrade required", { status: 403 });

  // Authorize: must manage the org that owns this event.
  const [membership, event] = await Promise.all([
    getUserMembershipRole(user.id, orgId),
    getEventDetailsById(eventId, orgId),
  ]);
  const canManage =
    membership?.role === OrgRole.ADMIN || membership?.role === OrgRole.OWNER;
    
  if (!event || !canManage) return new Response("Not found", { status: 404 });

  const tier = hasPro ? "pro" : "premium";

  const catalog = await getOrganizationSongs(orgId);
  
  if (catalog.length === 0) {
    return new Response("No songs in catalog", { status: 422 });
  }

  const agent = createSetlistAgent({
    tier,
    orgName: event.organization.name,
    catalog: catalog.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      bpm: s.bpm,
      timeSignature: s.timeSignature,
      defaultPitch: s.defaultPitch,
      defaultKeyQuality: s.defaultKeyQuality,
      themes: s.themes,
      spotifyUrl: s.spotifyUrl,
      youtubeUrl: s.youtubeUrl,
    })),
  });

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
    timeout: 290_000,
  });
}
