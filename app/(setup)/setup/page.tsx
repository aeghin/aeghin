import { currentUser } from "@/lib/services/user";
import { getInvitationNotices } from "@/lib/services/notifications";
import { SetupOptions } from "@/components/setup/setup-options";

export default async function SetupPage() {

  const user = await currentUser();

  // No row yet while user.created is in flight; the layout still renders setup,
  // and the invitations turn up on the next load.
  const invitations = user ? await getInvitationNotices(user.email) : [];

  return <SetupOptions invitations={invitations} />;
};
