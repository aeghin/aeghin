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
  /** Every role in the team, e.g. "Pianist, Aux Keys, Bassist". */
  roleLabels: string;
  assignedByName: string;
  settingsLink: string;
}

export default function TeamLeadEmail({
  recipientName,
  organizationName,
  logoUrl,
  teamLabel,
  roleLabels,
  assignedByName,
  settingsLink,
}: TeamLeadEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          You&apos;re now the {teamLabel} lead at {organizationName}
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
              <Text className="mt-2 text-sm text-gray-500 m-0">
                {assignedByName} set this up at {organizationName}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, when one of {teamLabel}&apos;s roles opens
                up — somebody declines, an invitation expires, or a member
                leaves — you&apos;ll be the one asked to fill it. Anybody else
                following {teamLabel} gets a heads-up that it&apos;s yours.
              </Text>

              <Section className="rounded-xl border border-gray-200 p-4 mb-6">
                <Text className="text-xs text-gray-500 m-0 mb-1">
                  {teamLabel} covers
                </Text>
                <Text className="text-sm font-medium text-gray-900 m-0">
                  {roleLabels}
                </Text>
              </Section>

              <Button
                href={settingsLink}
                className="rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                See Who Leads What
              </Button>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because an owner of{" "}
                {organizationName} made you a team lead.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
