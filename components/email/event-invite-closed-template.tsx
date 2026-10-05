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

interface EventInviteClosedEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  roleLabel: string;
  /** Who sent the invitation, to ask for it again. Null once they're gone. */
  invitedByName: string | null;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
}

export default function EventInviteClosedEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  roleLabel,
  invitedByName,
  eventDate,
  eventTime,
  viewLink,
}: EventInviteClosedEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          Your invitation to {eventName} expired — {organizationName}
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
                Invitation Expired
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                The time to answer has passed
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, your invitation to serve as {roleLabel}{" "}
                expired before you answered, so the spot has been opened up for
                somebody else.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
                <Text className="mt-1 text-sm text-gray-500 m-0">
                  {roleLabel}
                </Text>
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
                View Events
              </Button>

              <Text className="mt-6 text-xs text-gray-500 m-0">
                If you can still make it, ask{" "}
                {invitedByName ?? `an admin at ${organizationName}`} to send the
                invitation again.
              </Text>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you were invited to this
                event at {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
