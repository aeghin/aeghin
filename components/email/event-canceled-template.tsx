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

interface EventCanceledEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  canceledByName: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
}

export default function EventCanceledEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  canceledByName,
  eventDate,
  eventTime,
  viewLink,
}: EventCanceledEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {eventName} has been canceled — {organizationName}
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
                Event Canceled
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                An event you were on has been called off
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, {canceledByName} canceled an event you were
                scheduled for. You don&apos;t need to do anything.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
              </Section>

              {eventDate ? (
                <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                  <Text className="text-xs text-gray-500 m-0 mb-1">
                    Was scheduled for
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

              <Section className="rounded-xl border border-gray-200 p-4 mb-6">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Organization
                </Text>
                <Text className="text-sm font-medium text-gray-900 m-0">
                  {organizationName}
                </Text>
              </Section>

              <Button
                href={viewLink}
                className="rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                View Schedule
              </Button>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you were on the team for this
                event at {organizationName}. If this looks wrong, contact your
                organization admin.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
