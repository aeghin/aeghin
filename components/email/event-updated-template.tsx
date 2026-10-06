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
  /**
   * Whether they had accepted. False for somebody still deciding, who is told
   * the invitation stands and given the way to answer it.
   */
  accepted: boolean;
  viewLink: string;
}

export default function EventUpdatedEmail({
  recipientName,
  eventName,
  organizationName,
  logoUrl,
  updatedByName,
  changes,
  accepted,
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
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {updatedByName} changed the details below.{" "}
                {accepted ? "You're still on the team." : "Your invitation still stands."}
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 text-base font-semibold text-gray-900">
                  {eventName}
                </Text>
              </Section>

              {changes.map((change) => (
                <Section
                  key={change.label}
                  className="rounded-xl border border-gray-200 p-4 mb-4 text-left"
                >
                  <Text className="m-0 mb-1 text-xs text-gray-500">
                    {change.label}
                  </Text>
                  {change.from ? (
                    <Text className="m-0 mb-1 text-sm text-gray-400 line-through whitespace-pre-wrap">
                      {change.from}
                    </Text>
                  ) : null}
                  <Text className="m-0 text-sm font-semibold text-gray-900 whitespace-pre-wrap">
                    {change.to}
                  </Text>
                </Section>
              ))}

              <Button
                href={viewLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                {accepted ? "View Event" : "Accept or Decline"}
              </Button>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because{" "}
                {accepted ? "you're on the team for" : "you were invited to"} this
                event at {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
