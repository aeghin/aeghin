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

/**
 * Sent while the invitation is still open, so there's nothing to resend yet:
 * the Team card only offers that once it has expired.
 */
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
              <Text className="m-0 mt-2 text-sm text-gray-500">
                {timing}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName},{" "}
                {headsUp
                  ? "you don't need to do anything."
                  : "a quick message often gets an answer. If you'd rather not wait, invite somebody else from the event's Team card."}
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 text-base font-semibold text-gray-900">
                  {eventName}
                </Text>
                {eventDate ? (
                  <>
                    <Text className="m-0 mt-1 text-sm font-medium text-gray-900">
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

              <Section className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-left">
                <Text className="m-0 mb-2 text-xs text-gray-500">
                  Waiting on
                </Text>
                {waiting.map((invite) => (
                  <Text
                    key={`${invite.inviteeName}-${invite.roleLabel}`}
                    className="m-0 mb-1 text-sm font-semibold text-gray-900"
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

              <Button
                href={viewLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                View Event
              </Button>

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
