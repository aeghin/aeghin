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

interface EventMessageEmailProps {
  recipientName: string;
  senderName: string;
  organizationName: string;
  logoUrl: string | null;
  eventName: string;
  body: string;
  viewLink: string;
}

export default function EventMessageEmail({
  recipientName,
  senderName,
  organizationName,
  logoUrl,
  eventName,
  body,
  viewLink,
}: EventMessageEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {senderName} sent an update about {eventName} — {organizationName}
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
                Team Update
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                {senderName} sent a message to the team
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, here&apos;s an update about {eventName}.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  Event
                </Text>
                <Text className="text-base font-semibold text-gray-900 m-0">
                  {eventName}
                </Text>
              </Section>

              <Section className="rounded-xl border border-gray-200 p-4 mb-6 text-left">
                <Text className="text-xs text-gray-500 m-0 mb-2">
                  Message from {senderName}
                </Text>
                <Text className="text-sm text-gray-900 m-0 whitespace-pre-wrap">
                  {body}
                </Text>
              </Section>

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
                this event at {organizationName}. Reply to this email to reach{" "}
                {senderName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
