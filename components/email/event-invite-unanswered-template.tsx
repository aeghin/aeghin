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

import type { LapsedInvite as WaitingInvite } from "@/components/email/event-invite-expired-template";
import { organizationInitial } from "@/lib/email/organization";

interface EventInviteUnansweredEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  /** Every invitation on this event still waiting on an answer, at least one. */
  waiting: WaitingInvite[];
  /**
   * When an answer is needed: "The first expires Sat, Oct 11, 10:30 PM CDT",
   * or "Sunday Service is in 3 days" when the event comes first.
   */
  timing: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
  /** The footer's "why you got this". */
  footer?: string;
}

export default function EventInviteUnansweredEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  waiting,
  timing,
  eventDate,
  eventTime,
  viewLink,
  footer,
}: EventInviteUnansweredEmailProps) {
  const one = waiting.length === 1;
  // Nothing here is the recipient's to act on: every line is somebody else's.
  const headsUp = waiting.every((invite) => invite.headsUp);

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {one
            ? `${waiting[0].inviteeName} hasn't answered`
            : `${waiting.length} invitations haven't been answered`}{" "}
          — {eventName}, {organizationName}
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
                {headsUp ? "Heads-up: " : ""}No Answer Yet
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                {timing}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, {one ? "this invitation hasn't" : "these invitations haven't"}{" "}
                been accepted or declined yet. There&apos;s still time to plan
                around {one ? "it" : "them"}.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
              </Section>

              <Section className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-left">
                <Text className="text-xs text-gray-500 m-0 mb-2">
                  Still waiting to hear from
                </Text>
                {waiting.map((invite) => (
                  <Text
                    key={`${invite.inviteeName}-${invite.roleLabel}`}
                    className="text-sm font-semibold text-gray-900 m-0 mb-1"
                  >
                    {invite.inviteeName} — {invite.roleLabel}
                    {invite.headsUp ? (
                      <span className="font-normal text-gray-600">
                        {" "}· {invite.headsUp}
                      </span>
                    ) : null}
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
                View Event
              </Button>

              {headsUp ? null : (
                <Text className="mt-6 text-xs text-gray-500 m-0">
                  A quick message often gets an answer. From the event&apos;s
                  Team card you can send the invitation again for three more
                  days, or invite somebody else.
                </Text>
              )}

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                {footer ??
                  `You're receiving this because you manage this event at ${organizationName}.`}
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
