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

import { volunteerRoleConfig } from "@/lib/config/roles";
import { VolunteerRole } from "@/generated/prisma/enums";

interface InvitationEmailProps {
  organizationName: string;
  logoUrl: string | null;
  /** Full name of whoever sent it: "James Lee". */
  invitedByName: string;
  volunteerRoles: VolunteerRole[];
  inviteLink: string;
  expiresInDays?: number;
}

export default function InvitationEmail({
  organizationName,
  logoUrl,
  invitedByName,
  volunteerRoles,
  inviteLink,
  expiresInDays = 7,
}: InvitationEmailProps) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {invitedByName} invited you to join {organizationName}
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
                You&apos;re Invited
              </Text>
              <Text className="m-0 mt-2 text-sm text-gray-500">
                {invitedByName} invited you to join {organizationName}
              </Text>
            </Section>


            <Section className="px-8 py-6 text-center">

              <Section className="rounded-xl border border-gray-200 p-4 mb-4">
                <Text className="m-0 mb-2 text-xs text-gray-500">
                  Your role{volunteerRoles.length > 1 ? "s" : ""}
                </Text>
                {volunteerRoles.map((role) => {
                  const { label, icon } = volunteerRoleConfig[role];
                  return (
                    <Text
                      key={label}
                      className="m-0 my-1 text-sm font-medium text-gray-900"
                    >
                      {icon} {label}
                    </Text>
                  );
                })}
              </Section>

              <Button
                href={inviteLink}
                className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
              >
                View Invitation
              </Button>

              <Text className="m-0 mt-6 text-xs text-gray-400">
                This invitation expires in {expiresInDays} days.
              </Text>
            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                If you didn&apos;t expect this invitation, you can safely ignore
                this email.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
