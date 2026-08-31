import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/setup(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  };
});

export const config = {
  matcher: ["/dashboard(.*)", "/setup(.*)", "/api/realtime/(.*)", "/api/uploadthing(.*)", "/invite(.*)", "/api/setlist-ai(.*)", "/api/mobile(.*)"],
};
