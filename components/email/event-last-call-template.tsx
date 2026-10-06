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

export type WaitingReply = {
  inviteeName: string;
  roleLabel: string;
};

interface EventLastCallEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  /** Roles nobody has accepted and nobody is still deciding on. */
  unfilledRoles: string[];
  /** Invitations still waiting on an answer, on any role. */
  waitingOn: WaitingReply[];
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
  /** The footer's "why you got this". */
  footer?: string;
}

export default function EventLastCallEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  unfilledRoles,
  waitingOn,
  eventDate,
  eventTime,
  viewLink,
  footer,
}: EventLastCallEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {eventName} isn&apos;t fully staffed yet — {organizationName}
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
                Not Fully Staffed Yet
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, this event is coming up and some spots
                aren&apos;t confirmed yet.
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

              {unfilledRoles.length > 0 ? (
                <Section className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-left">
                  <Text className="m-0 mb-2 text-xs text-amber-700">
                    No one yet
                  </Text>
                  {unfilledRoles.map((roleLabel) => (
                    <Text
                      key={roleLabel}
                      className="m-0 mb-1 text-sm font-semibold text-amber-900"
                    >
                      {roleLabel}
                    </Text>
                  ))}
                </Section>
              ) : null}

              {waitingOn.length > 0 ? (
                <Section className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-4 text-left">
                  <Text className="m-0 mb-2 text-xs text-gray-500">
                    Waiting on
                  </Text>
                  {waitingOn.map((invite) => (
                    <Text
                      key={`${invite.inviteeName}-${invite.roleLabel}`}
                      className="m-0 mb-1 text-sm font-semibold text-gray-900"
                    >
                      {invite.inviteeName} — {invite.roleLabel}
                    </Text>
                  ))}
                </Section>
              ) : null}

              <Button
                href={viewLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                Staff This Event
              </Button>

              <Text className="m-0 mt-6 text-xs text-gray-500">
                You&apos;ll get this at most twice: about 3 days and 1 day
                before the event.
              </Text>

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
