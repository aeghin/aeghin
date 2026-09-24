import { Users, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MembersList } from "@/components/dashboard/members-list";
import { EmailOrganizationDialog } from "@/components/dashboard/email-organization-dialog";
import { organizationMembersList } from "@/lib/services/organization";
import { getEmailAllowance } from "@/lib/billing/limits";
import { OrgRole } from "@/generated/prisma/enums";
import { notFound } from "next/navigation";

interface MembersTabContentProps {
  organizationId: string;
  organizationName: string;
  userId: string;
}
export const MembersTabContent = async ({
  organizationId,
  organizationName,
  userId
}: MembersTabContentProps) => {

  const members = await organizationMembersList(organizationId);

  const sorted = [
    ...members.filter((mem) => mem.user.id === userId),
    ...members.filter((mem) => mem.user.id !== userId)
  ];

  const viewerRole = members.find(mem => mem.user.id === userId)?.role;

  if (!viewerRole) notFound();

  const canManage = viewerRole === OrgRole.OWNER || viewerRole === OrgRole.ADMIN;

  // Only managers send group emails, so only they pay for the count.
  const emailAllowance = canManage ? await getEmailAllowance(organizationId) : null;

  const visibleMembers = canManage
    ? sorted
    : sorted.map((member) =>
        member.user.id === userId
          ? member
          : { ...member, user: { ...member.user, email: "", phoneNumber: "" } },
      );


  return (
    <Card className="overflow-hidden rounded-xl border-border/40 bg-linear-to-br from-card to-card/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-secondary/20 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">
              Team Members
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {members.length} total members
            </p>
          </div>
        </div>

        {emailAllowance && members.length > 1 && (
          <EmailOrganizationDialog
            organizationId={organizationId}
            organizationName={organizationName}
            recipientCount={members.length}
            allowance={emailAllowance}
            canUpgrade={viewerRole === OrgRole.OWNER}
          />
        )}
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="flex h-50 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Users className="h-10 w-10 opacity-20" />
            <p className="text-sm">No members found</p>
          </div>
        ) : (
          <MembersList members={visibleMembers} currentUserId={userId} viewerRole={viewerRole}/>
        )}
      </CardContent>
    </Card>
  );
};