
import Link from "next/link";
import prisma from "@/lib/prisma";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Mail,
  XCircle,
  ArrowLeft,
  Clock,
} from "lucide-react";

import { auth } from "@clerk/nextjs/server";
import { verifyInvitationByToken } from "@/lib/services/invitation";
import { InviteActions } from "@/components/invites/org-invite-buttons";
import { OpenInApp } from "@/components/invites/open-in-app";
import { AcceptedCountdown } from "@/components/invites/accept-countdown";
import { InvitationStatus } from "@/generated/prisma/enums";

const Header = () => (
  <header className="border-b bg-card">
    <div className="mx-auto flex h-16 max-w-7xl items-center px-6">
      <Link href="/" className="flex items-center gap-2">
        <img
          src="/aeghin-icon.svg"
          alt=""
          className="h-8 w-8 rounded-lg shadow-lg shadow-primary/25"
        />
        <span className="font-brand text-lg font-semibold">aeghin</span>
      </Link>
    </div>
  </header>
);

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen flex-col">
    <Header />
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  </div>
);

const InvitePage = async ({
  params,
}: {
  params: Promise<{ token: string }>;
}) => {
  const { token } = await params;

  const invitation = await verifyInvitationByToken(token);

  if (!invitation) {
    return (
      <PageWrapper>
        <Card className="border-2 overflow-hidden text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">
              Invalid Invitation
            </h1>
            <p className="text-muted-foreground mb-6">
              This invitation link is not valid. Please check the link and
              try again.
            </p>
            <Link href="/">
              <Button variant="outline" className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  };

  const { userId } = await auth();

  const user = userId
    ? await prisma.user.findUnique({ where: { clerkId: userId } })
    : null;

  // A successful accept refreshes this route; the invitee lands here with the
  // invitation now ACCEPTED. Show the success/countdown screen instead of the
  // "Invitation Unavailable" wall below.
  if (
    invitation.status === InvitationStatus.ACCEPTED &&
    user?.email.toLowerCase() === invitation.email.toLowerCase()
  ) {
    return (
      <PageWrapper>
        <AcceptedCountdown
          orgId={invitation.organizationId}
          organizationName={invitation.organization.name}
        />
      </PageWrapper>
    );
  };

   if (invitation.status !== InvitationStatus.PENDING) {
    return (
      <PageWrapper>
        <Card className="border-2 overflow-hidden text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <XCircle className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">
              Invitation Unavailable
            </h1>
            <p className="text-muted-foreground mb-6">
              This invitation has already been {invitation.status.toLowerCase()}.
            </p>
            <Link href="/">
              <Button variant="outline" className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  };

  if (invitation.expiresAt < new Date()) {
    return (
      <PageWrapper>
        <Card className="border-2 overflow-hidden text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Clock className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">
              Invitation Expired
            </h1>
            <p className="text-muted-foreground mb-6">
              This invitation is no longer valid. Please ask the
              organization admin to send a new one.
            </p>
            <Link href="/">
              <Button variant="outline" className="cursor-pointer">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  };

  if (!userId) {

  return (
    <PageWrapper>
      <Card className="border-2 overflow-hidden text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            You&apos;re invited to join{" "}
            <span className="text-primary">{invitation.organization.name}</span>
          </h1>
          <p className="text-muted-foreground mb-6">
            Sign in or create an account to accept this invitation.
          </p>
          <div className="flex flex-col gap-3">
            <Link href={`/sign-in?redirect_url=/invite/${token}`}>
              <Button className="w-full cursor-pointer shadow-lg shadow-primary/25">
                Sign In
              </Button>
            </Link>
            <Link href={`/sign-up?redirect_url=/invite/${token}`}>
              <Button variant="outline" className="w-full cursor-pointer">
                Create Account
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
};

  const organizationName = invitation.organization.name;
  const invitedBy = invitation.invitedBy.firstName;
  const roles = invitation.volunteerRoles;
  const email = invitation.email;

  if (!user) {
  return (
    <PageWrapper>
      <Card className="border-2 overflow-hidden text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Setting Up Your Account
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account is still being set up. Please refresh the page or try
            again in a moment.
          </p>
          <Link href={`/invite/${token}`}>
            <Button variant="outline" className="cursor-pointer">
              Try Again
            </Button>
          </Link>
        </CardContent>
      </Card>
    </PageWrapper>
  );
};

  if (email.toLowerCase() !== user.email.toLowerCase()) {
  return (
    <PageWrapper>
      <Card className="border-2 overflow-hidden text-center">
        <CardContent className="p-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Mail className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Email Mismatch
          </h1>
          <p className="text-muted-foreground mb-2">
            This invitation was sent to
          </p>
          <p className="font-semibold text-foreground mb-4">
            {email}
          </p>
          <p className="text-muted-foreground mb-6">
            Please sign in with that email or ask the organization admin to
            resend the invitation to your current address.
          </p>
          <Link href={`/sign-in?redirect_url=/invite/${token}`}>
            <Button variant="outline" className="cursor-pointer">
              Sign In with Different Account
            </Button>
          </Link>
        </CardContent>
      </Card>
    </PageWrapper>
  );
};

return (
    <PageWrapper>
      <InviteActions
        token={token}
        organizationName={organizationName}
        invitedBy={invitedBy}
        roles={roles}
        email={email}
      />
      <OpenInApp token={token} />
    </PageWrapper>
  );
};

export default InvitePage;
