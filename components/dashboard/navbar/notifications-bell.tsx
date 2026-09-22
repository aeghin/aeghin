import { Bell } from "lucide-react";

import { getUserNotifications } from "@/lib/services/notifications";
import { currentUser } from "@/lib/services/user";

import { NotificationsMenu } from "./notifications-menu";

/**
 * Placeholder that reserves the bell's space while the feed resolves, so the
 * navbar does not reflow around it on every load.
 */
export function NotificationsBellSkeleton() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg">
      <Bell className="h-4.5 w-4.5 text-muted-foreground/40" />
    </div>
  );
}

/**
 * Reading the feed needs the signed-in user, which is dynamic — so this sits
 * behind its own Suspense boundary in the navbar rather than making the whole
 * header wait on a query nothing else depends on.
 */
export async function NotificationsBell() {
  const user = await currentUser();

  if (!user) return null;

  const { items, unreadCount } = await getUserNotifications(user.id);

  return <NotificationsMenu items={items} unreadCount={unreadCount} />;
}
