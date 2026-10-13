import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/setup(.*)"]);

// The org page's sections used to be `?tab=` values on one route; each is its
// own route now (Events stays at the org's root). Old links and bookmarks are
// sent to the section's new home here, so no page has to read search params.
const ORG_ROOT = /^\/dashboard\/organizations\/([^/]+)\/?$/;
const MOVED_TABS = new Set(["members", "blockouts", "keys", "invitations", "templates", "activity", "settings"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  };

  const orgRoot = req.nextUrl.pathname.match(ORG_ROOT);
  const tab = req.nextUrl.searchParams.get("tab");

  if (orgRoot && tab !== null) {
    const destination = req.nextUrl.clone();
    destination.searchParams.delete("tab");
    destination.pathname = MOVED_TABS.has(tab)
      ? `/dashboard/organizations/${orgRoot[1]}/${tab}`
      : `/dashboard/organizations/${orgRoot[1]}`;
    return NextResponse.redirect(destination);
  }
});

export const config = {
  matcher: ["/dashboard(.*)", "/setup(.*)", "/api/realtime/(.*)", "/api/uploadthing(.*)", "/invite(.*)", "/api/setlist-ai(.*)", "/api/event-ai(.*)", "/api/mobile(.*)"],
};
