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

interface EventInviteReminderEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  roleLabel: string;
  /** Full name of whoever sent it. Null once they're gone from the organization. */
  invitedByName: string | null;
  /** Smart Scheduling sent it to fill a spot somebody declined: no person chose them. */
  autoFilled: boolean;
  /**
   * When the answer is needed: "Your invitation expires Sat, Oct 11, 10:30 PM
   * CDT", or "Sunday Service is in 3 days" when the event comes first.
   */
  timing: string;
  /** Whether the event comes before the invitation would close. */
  eventFirst: boolean;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
}

export default function EventInviteReminderEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  roleLabel,
  invitedByName,
  autoFilled,
  timing,
  eventFirst,
  eventDate,
  eventTime,
  viewLink,
}: EventInviteReminderEmailProps) {
  const invited = autoFilled
    ? `a spot opened up on this event, and you're invited to serve as ${roleLabel}.`
    : invitedByName
      ? `${invitedByName} invited you to serve as ${roleLabel}.`
      : `you're invited to serve as ${roleLabel}.`;

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {organizationName} still needs your answer for {eventName}
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
                Still Need Your Answer
              </Text>
              <Text className="m-0 mt-2 text-sm text-gray-500">
                {timing}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {invited} Let {organizationName} know
                whether you can make it.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 text-base font-semibold text-gray-900">
                  {eventName}
                </Text>
                <Text className="m-0 mt-1 text-sm text-gray-600">
                  {roleLabel}
                </Text>
                {eventDate ? (
                  <>
                    <Text className="m-0 mt-3 text-sm font-medium text-gray-900">
                      {eventDate}
                    </Text>
                    {eventTime ? (
                      <Text className="m-0 mt-1 text-sm text-gray-500">
                        {eventTime}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Section>

              <Button
                href={viewLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                Accept or Decline
              </Button>

              <Text className="m-0 mt-6 text-xs text-gray-500">
                {eventFirst
                  ? "Answering before it starts lets the team know who's coming."
                  : "After it expires, it can't be accepted unless an admin sends it again."}
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
