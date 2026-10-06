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

/** One team whose handling changed on the event, and who has it now. */
export type TeamHandoff = {
  /** "Band". */
  teamLabel: string;
  /** "Kevin Ng · this event only", or "Back to James Lee, the lead". */
  handler: string;
};

interface EventTeamHandoffEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  /** "Band Handed Off", or "Heads-up: Team Change" for an owner. */
  heading: string;
  /** The sentence after "Hi …,", naming who made the change. */
  message: string;
  eventName: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  handoffs: TeamHandoff[];
  viewLink: string;
  /** The footer's "why you got this". */
  footer: string;
}

/**
 * An admin handed a team to somebody else on one event. Sent to the team's
 * regular lead, whose alerts for that event go elsewhere, and to the owners,
 * who set the standing leads and can change it back.
 */
export default function EventTeamHandoffEmail({
  recipientName,
  organizationName,
  logoUrl,
  heading,
  message,
  eventName,
  eventDate,
  eventTime,
  handoffs,
  viewLink,
  footer,
}: EventTeamHandoffEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {heading} · {eventName}
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
                {heading}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {message}
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
                {handoffs.map((handoff) => (
                  <Text
                    key={handoff.teamLabel}
                    className="m-0 mt-3 text-sm text-gray-900"
                  >
                    <span className="font-semibold">{handoff.teamLabel}</span>
                    <span className="text-gray-600"> — {handoff.handler}</span>
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
                {footer}
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
