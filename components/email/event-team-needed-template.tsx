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

interface EventTeamNeededEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  eventName: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  /** The teams they handle on this event, e.g. "Band" or "Band and Vocals". */
  teamLabels: string;
  /** The spots still open on them, e.g. "Drummer, BGVs ×2". Empty when every one was filled. */
  openRoles: string;
  /** Who the creator invited into their teams, each with their role. Empty for roles added later. */
  invited: { name: string; role: string }[];
  /** The teams those invitations are on, e.g. "Band". */
  invitedTeams: string;
  actorName: string;
  /** Roles added to an event that already existed, rather than a new event. */
  added: boolean;
  viewLink: string;
  /** Why this reached them: their lead, or their cover for this event. */
  footer: string;
}

export default function EventTeamNeededEmail({
  recipientName,
  organizationName,
  logoUrl,
  eventName,
  eventDate,
  eventTime,
  teamLabels,
  openRoles,
  invited,
  invitedTeams,
  actorName,
  added,
  viewLink,
  footer,
}: EventTeamNeededEmailProps) {
  const heading = added ? `${openRoles} Added` : `New Event for ${teamLabels}`;
  const who = invited.length === 1 ? invited[0].name : `${invited.length} people`;

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {added
            ? `${openRoles} added to ${eventName}`
            : invited.length > 0
              ? `${actorName} invited ${who} to ${invitedTeams} for ${eventName}`
              : `${eventName} needs ${teamLabels}`}
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
                {added ? (
                  <>
                    Hi {recipientName}, {actorName} added {openRoles} to this
                    event. It&apos;s yours to staff.
                  </>
                ) : invited.length === 0 ? (
                  <>
                    Hi {recipientName}, {actorName} created this event and left{" "}
                    {teamLabels} for you to staff.
                  </>
                ) : openRoles ? (
                  <>
                    Hi {recipientName}, {actorName} created this event, invited{" "}
                    {who} to {invitedTeams} and left the rest for you to staff.
                  </>
                ) : (
                  <>
                    Hi {recipientName}, {actorName} created this event and invited{" "}
                    {who} to {invitedTeams}.
                  </>
                )}
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
                {invited.length > 0 ? (
                  <>
                    <Text className="m-0 mt-3 mb-1 text-xs text-gray-500">
                      Invited
                    </Text>
                    {invited.map((person, index) => (
                      <Text key={index} className="m-0 text-sm font-medium text-gray-900">
                        {person.name} · {person.role}
                      </Text>
                    ))}
                  </>
                ) : null}
                {openRoles ? (
                  <>
                    <Text className="m-0 mt-3 mb-1 text-xs text-gray-500">
                      Open spots
                    </Text>
                    <Text className="m-0 text-sm font-medium text-gray-900">
                      {openRoles}
                    </Text>
                  </>
                ) : null}
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
