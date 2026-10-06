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

interface TeamLeadEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  /** "Band", "Vocals", "Production" or "Hospitality". */
  teamLabel: string;
  /** Which service they lead it for, e.g. "Sunday Worship". */
  serviceTypeName: string;
  /** Every role in the team, e.g. "Pianist, Aux Keys, Bassist". */
  roleLabels: string;
  assignedByName: string;
  /** The organization's events, where the team's open spots show up. */
  eventsLink: string;
}

export default function TeamLeadEmail({
  recipientName,
  organizationName,
  logoUrl,
  teamLabel,
  serviceTypeName,
  roleLabels,
  assignedByName,
  eventsLink,
}: TeamLeadEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          You&apos;re now the {teamLabel} lead for {serviceTypeName} at{" "}
          {organizationName}
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
                You&apos;re the {teamLabel} Lead
              </Text>
              <Text className="m-0 mt-2 text-sm text-gray-500">
                For {serviceTypeName}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {assignedByName} made you the {teamLabel}{" "}
                lead. When a {teamLabel} spot opens up — a decline, an expired
                invitation, or someone leaving — you&apos;ll be asked to fill
                it. Anyone on {teamLabel}&apos;s Also notify gets a heads-up.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 mb-1 text-xs text-gray-500">
                  {teamLabel} roles
                </Text>
                <Text className="m-0 text-sm font-medium text-gray-900">
                  {roleLabels}
                </Text>
              </Section>

              <Button
                href={eventsLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                View Events
              </Button>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you lead {teamLabel} for{" "}
                {serviceTypeName} at {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
