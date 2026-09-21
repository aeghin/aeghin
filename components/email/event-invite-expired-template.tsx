import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Button,
  Img,
  Tailwind,
} from "@react-email/components";

import { organizationInitial } from "@/lib/email/organization";

export type LapsedInvite = {
  inviteeName: string;
  roleLabel: string;
};

interface EventInviteExpiredEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  /** Every invitation on this event that lapsed unanswered, at least one. */
  lapsed: LapsedInvite[];
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
}

export default function EventInviteExpiredEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  lapsed,
  eventDate,
  eventTime,
  viewLink,
}: EventInviteExpiredEmailProps) {
  const roles = [...new Set(lapsed.map((invite) => invite.roleLabel))];
  const one = lapsed.length === 1;
  // Two people can be invited to the same role, so the count of invitations and
  // the count of roles diverge. The subject line branches on roles; so does
  // anything here that names a role.
  const oneRole = roles.length === 1;

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {eventName} still needs {oneRole ? `a ${roles[0]}` : `${roles.length} roles filled`} — {organizationName}
        </Preview>
        <Body className="bg-gray-100 font-sans">
          <Container className="mx-auto my-10 max-w-120 rounded-2xl bg-white shadow-sm overflow-hidden">

            <Section className="bg-linear-to-br from-gray-50 to-gray-100 px-8 pt-10 pb-8 text-center">
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  alt={organizationName}
                  width="64"
                  height="64"
                  className="mx-auto mb-4 rounded-2xl object-cover"
                />
              ) : (
                <Section className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-black text-center leading-16">
                  <Text className="text-2xl font-bold text-white m-0">
                    {organizationInitial(organizationName)}
                  </Text>
                </Section>
              )}
              <Text className="text-2xl font-bold tracking-tight text-gray-900 m-0">
                {one ? "Invitation Expired" : "Invitations Expired"}
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                The response window closed and {oneRole ? "the role is" : "the roles are"} still open
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, {one ? "this invitation" : "these invitations"} expired
                without an answer, so {oneRole ? "the role is" : "the roles are"} back to
                needing someone.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
              </Section>

              <Section className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-left">
                <Text className="text-xs text-amber-700 m-0 mb-2">
                  No response from
                </Text>
                {lapsed.map((invite) => (
                  <Text
                    key={`${invite.inviteeName}-${invite.roleLabel}`}
                    className="text-sm font-semibold text-amber-900 m-0 mb-1"
                  >
                    {invite.inviteeName} — {invite.roleLabel}
                  </Text>
                ))}
              </Section>

              {eventDate ? (
                <Section className="rounded-xl border border-gray-200 p-4 mb-6">
                  <Text className="text-xs text-gray-500 m-0 mb-1">
                    Scheduled for
                  </Text>
                  <Text className="text-sm font-medium text-gray-900 m-0">
                    {eventDate}
                  </Text>
                  {eventTime ? (
                    <Text className="mt-1 text-sm text-gray-500 m-0">
                      {eventTime}
                    </Text>
                  ) : null}
                </Section>
              ) : null}

              <Button
                href={viewLink}
                className="rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                Staff This Event
              </Button>

              <Text className="mt-6 text-xs text-gray-500 m-0">
                From the event&apos;s Team card you can send the invitation
                again, clear it away, or invite somebody else.
              </Text>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you manage this event at{" "}
                {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
