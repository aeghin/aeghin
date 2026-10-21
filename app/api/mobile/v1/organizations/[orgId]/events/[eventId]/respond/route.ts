import { auth } from "@clerk/nextjs/server";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
    acceptEventInvitation,
    declineEventInvitation,
    withdrawFromEvent,
} from "@/lib/actions/event";


/**
 * Wire contract for answering an invitation from the phone. The Expo app posts
 * `{ action }` and reads back the status the assignment now holds — see
 * `useRespondToInvitation` and `useWithdrawFromEvent` in
 * `src/hooks/use-events.ts`. `withdraw` is "Can't make it", for an invitation
 * already accepted.
 */
type RespondAction = "accept" | "decline" | "withdraw";

type RespondBody = {
    action: RespondAction;
};


const NO_STORE = { "Cache-Control": "private, no-store" };

const isRespondAction = (value: unknown): value is RespondAction =>
    value === "accept" || value === "decline" || value === "withdraw";

/**
 * Route-handler-safe cache expiry, for the actions called below.
 *
 * `{ expire: 0 }` rather than `"max"`, for the reason `lib/mobile/route.ts`
 * spells out: the phone refetches immediately, and a stale window means that
 * refetch is served the pre-write state.
 */
const expireTag = (tag: string) => {
    revalidateTag(tag, { expire: 0 });
};


/**
 * POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/respond
 *
 * Accepts or declines the caller's own invitation to one event, or takes them
 * off one they had accepted.
 *
 * The work itself belongs to the server actions the dashboard's pending cards
 * already call, and this route calls those rather than repeating them: a
 * decline is not one status flip but a smart-fill search, an auto-invite
 * inheriting the original deadline, an activity entry, and an email. Two copies
 * of that would drift, and the phone would quietly stop matching the web.
 *
 * The one thing a route handler cannot borrow is how those actions expire their
 * cache tags: `updateTag` throws outside a Server Action. So they take the
 * invalidator as an argument and this passes `revalidateTag`, which is the same
 * expiry without the read-your-writes refresh a dashboard render wants and a
 * JSON response has no use for.
 */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ orgId: string; eventId: string }> },
) {

    try {

        const { userId } = await auth();

        // The actions below reach for the caller through `currentUser`, which
        // redirects to the sign-in page when there is nobody there. A redirect
        // is an HTML page to `fetch`, and the app would choke parsing it as
        // JSON — so the token is checked here, before the action can.
        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401, headers: NO_STORE },
            );
        };

        const { orgId, eventId } = await params;

        const membership = await prisma.membership.findFirst({
            where: {
                organizationId: orgId,
                user: {
                    clerkId: userId,
                },
            },
            select: {
                id: true,
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Not Found" },
                { status: 404, headers: NO_STORE },
            );
        };

        // A body that isn't JSON at all throws rather than returning null, and
        // that is still a bad request rather than a server fault.
        const body: unknown = await req.json().catch(() => null);

        const action = (body as RespondBody | null)?.action;

        if (!isRespondAction(action)) {
            return NextResponse.json(
                { error: "Expected an action of \"accept\", \"decline\" or \"withdraw\"." },
                { status: 400, headers: NO_STORE },
            );
        };

        const result =
            action === "accept"
                ? await acceptEventInvitation(orgId, eventId, expireTag)
                : action === "decline"
                    ? await declineEventInvitation(orgId, eventId, expireTag)
                    : await withdrawFromEvent(orgId, eventId, expireTag);

        // The actions answer a miss the same way, and every cause of one is a
        // conflict rather than a fault: the invitation expired, somebody
        // already answered it, it was withdrawn, or the event has started.
        // The app shows the message.
        if (!result.success) {
            // The actions turn a thrown error into this same shape, so without
            // a line here a real fault inside one leaves no trace at all — only
            // a 409 the app reports as a conflict it isn't.
            console.error(
                `POST .../events/${eventId}/respond: ${action} failed —`,
                result.error,
            );
            return NextResponse.json(
                { error: result.error },
                { status: 409, headers: NO_STORE },
            );
        };

        return NextResponse.json(
            { status: action === "accept" ? "ACCEPTED" : "DECLINED" },
            { headers: NO_STORE },
        );

    } catch (err) {
        console.error(
            "POST /api/mobile/v1/organizations/[orgId]/events/[eventId]/respond failed",
            err,
        );
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500, headers: NO_STORE },
        );
    };

};
