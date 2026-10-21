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

interface EventReplacementEmailProps {
  /**
   * `invited`: somebody declined and Smart Scheduling invited `replacementName`
   * in their place. `accepted`: that replacement has said yes.
   */
  kind: "invited" | "accepted";
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  roleLabel: string;
  /** Full name, as every email names people. */
  replacementName: string;
  /** For "You'll hear again when Jane answers." */
  replacementFirstName: string;
  /** Who declined. Only `invited` names them; the accepted row doesn't record it. */
  declinedByName: string | null;
  /** They had accepted, then said they can't make it, rather than declining. */
  backedOut?: boolean;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
  /** The footer's "why you got this". */
  footer: string;
}

/**
 * What Smart Scheduling did with a declined spot, for whoever runs its team.
 * Nobody has to act on either, so neither asks them to: the "Pianist needed"
 * email is the one for a spot it couldn't fill. Says what the push says.
 */
export default function EventReplacementEmail({
  kind,
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  roleLabel,
  replacementName,
  replacementFirstName,
  declinedByName,
  backedOut = false,
  eventDate,
  eventTime,
  viewLink,
  footer,
}: EventReplacementEmailProps) {
  const invited = kind === "invited";

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {invited
            ? `Smart Scheduling invited ${replacementName} as ${roleLabel} for ${eventName}`
            : `${replacementName} accepted ${roleLabel} for ${eventName}`}
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
                {invited ? "Replacement Invited" : "Spot Filled"}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                {invited
                  ? `Hi ${recipientName}, ${declinedByName ?? "Somebody"} ${backedOut ? `can't make it as ${roleLabel} anymore` : `declined ${roleLabel}`}. Smart Scheduling invited ${replacementName} in their place.`
                  : `Hi ${recipientName}, ${replacementName} accepted the ${roleLabel} invitation Smart Scheduling sent after a decline.`}
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
                View Event
              </Button>

              {invited ? (
                <Text className="m-0 mt-6 text-xs text-gray-500">
                  Nothing to do unless you&apos;d rather pick someone else.
                  You&apos;ll hear again when {replacementFirstName} answers.
                </Text>
              ) : null}

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                {footer}
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
