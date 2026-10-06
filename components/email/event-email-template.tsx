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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface EventAssignmentEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  roleLabel: string;
  /**
   * How the invitation came about: sent with the event or added later, sent
   * again after it expired, or Smart Scheduling filling a spot somebody
   * declined — which no person chose, so it names nobody.
   */
  kind: "invite" | "resend" | "replacement";
  /** Full name of whoever sent it. Null once they're gone from the organization. */
  invitedByName: string | null;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  /** The event's first start, from `eventStart`. Null when it has no dates. */
  startsAt: Date | null;
  expiresAt: Date;
  viewLink: string;
}

/**
 * When the answer is due, in words. A deadline is counted from when the
 * invitation was sent and never cut short for the event, so an event inside
 * the window comes first. Its start is wall-clock time written as UTC — hours
 * out at most, which a count of days can bear.
 */
function answerBy(expiresAt: Date, startsAt: Date | null): string {
  const now = Date.now();

  if (startsAt && startsAt.getTime() > now && startsAt < expiresAt) {
    return "Please answer before the event starts.";
  }

  // An hour's slack, so a 7-day invitation mailed a moment after it was made
  // still reads 7.
  const days = Math.floor((expiresAt.getTime() - now + HOUR_MS) / DAY_MS);

  if (days < 1) return "This invitation expires within a day.";

  return `This invitation expires in ${days} ${days === 1 ? "day" : "days"}.`;
}

export default function EventAssignmentEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  roleLabel,
  kind,
  invitedByName,
  eventDate,
  eventTime,
  startsAt,
  expiresAt,
  viewLink,
}: EventAssignmentEmailProps) {
  const ask =
    kind === "replacement"
      ? `a spot opened up on this event, and you're invited to serve as ${roleLabel}.`
      : kind === "resend"
        ? invitedByName
          ? `${invitedByName} sent your ${roleLabel} invitation again.`
          : `your ${roleLabel} invitation was sent again.`
        : invitedByName
          ? `${invitedByName} invited you to serve as ${roleLabel}.`
          : `you're invited to serve as ${roleLabel}.`;

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {roleLabel}
          {eventDate ? ` · ${eventDate}` : ""} — {organizationName}
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
                You&apos;re Invited to Serve
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {ask} Can you make it?
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
                {answerBy(expiresAt, startsAt)}
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
