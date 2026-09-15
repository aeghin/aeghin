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

/** One field that moved, as the email states it. */
export type EventChange = {
  label: string;
  /**
   * The previous value, struck through above the new one. Null for a field
   * where showing the before is noise rather than context — a rewritten
   * description reads as two walls of prose, not as a diff.
   */
  from: string | null;
  to: string;
};

interface EventUpdatedEmailProps {
  recipientName: string;
  /** The name the event carries *now*; a rename shows up in `changes`. */
  eventName: string;
  organizationName: string;
  logoUrl: string | null;
  updatedByName: string;
  changes: EventChange[];
  viewLink: string;
}

export default function EventUpdatedEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  updatedByName,
  changes,
  viewLink,
}: EventUpdatedEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {eventName} has been updated — {organizationName}
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
                Event Updated
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                Something changed on an event you&apos;re on
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, {updatedByName} updated an event you&apos;re
                scheduled for. Here&apos;s what changed.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
              </Section>

              {changes.map((change, index) => (
                <Section
                  key={change.label}
                  className={`rounded-xl border border-gray-200 p-4 text-left ${
                    index === changes.length - 1 ? "mb-6" : "mb-4"
                  }`}
                >
                  <Text className="text-xs text-gray-500 m-0 mb-1">
                    {change.label}
                  </Text>
                  {change.from ? (
                    <Text className="text-sm text-gray-400 line-through m-0 mb-1">
                      {change.from}
                    </Text>
                  ) : null}
                  <Text className="text-sm font-semibold text-gray-900 m-0 whitespace-pre-wrap">
                    {change.to}
                  </Text>
                </Section>
              ))}

              <Button
                href={viewLink}
                className="rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                View Event
              </Button>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you&apos;re on the team for
                this event at {organizationName}. Your spot hasn&apos;t changed
                — only the details above.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
