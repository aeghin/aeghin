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

interface EventRehearsalReminderEmailProps {
  recipientName: string;
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  roleLabel: string;
  /** `formatRehearsal`'s "Sat, Nov 2 · 6:00 PM – 8:00 PM". */
  rehearsal: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  /** Empty when the event has no location. */
  location: string;
  viewLink: string;
}

/**
 * The day before a rehearsal, to everybody who accepted its event: "Tomorrow:
 * rehearsal for Sunday Service". Goes with the push of the same title, at the
 * same moment.
 */
export default function EventRehearsalReminderEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  roleLabel,
  rehearsal,
  eventDate,
  eventTime,
  location,
  viewLink,
}: EventRehearsalReminderEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          Rehearsal for {eventName} is tomorrow
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
                Rehearsal Tomorrow
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, the rehearsal for {eventName} is tomorrow.
                You&apos;re serving as {roleLabel}.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 text-base font-semibold text-gray-900">
                  Rehearsal
                </Text>
                <Text className="m-0 mt-1 text-sm font-medium text-gray-900">
                  {rehearsal}
                </Text>
                {location ? (
                  <Text className="m-0 mt-1 text-sm text-gray-600">
                    {location}
                  </Text>
                ) : null}
                <Text className="m-0 mt-3 text-sm font-semibold text-gray-900">
                  {eventName}
                </Text>
                {eventDate ? (
                  <>
                    <Text className="m-0 mt-1 text-sm text-gray-600">
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

              <Text className="m-0 mt-6 text-xs text-gray-500">
                If something has come up, let {organizationName} know as soon
                as you can.
              </Text>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you accepted this event at{" "}
                {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
