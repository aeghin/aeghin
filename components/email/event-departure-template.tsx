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
  Link,
  Tailwind,
} from "@react-email/components";

import { organizationInitial } from "@/lib/email/organization";

export type VacatedSpot = {
  eventName: string;
  roleLabel: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  viewLink: string;
  /**
   * Set when the recipient is copied in on this one rather than asked to act
   * — "Sam (Band lead) has been asked to fill it."
   */
  headsUp?: string | null;
};

interface EventDepartureEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  departedName: string;
  reason: "left" | "removed" | "deleted";
  /** Who removed them, when an owner or admin did. */
  removedByName?: string | null;
  /** Every upcoming event of the recipient's this leaves short, soonest first. */
  vacated: VacatedSpot[];
  /** The footer's "why you got this". */
  footer?: string;
}

export default function EventDepartureEmail({
  recipientName,
  organizationName,
  logoUrl,
  departedName,
  reason,
  removedByName = null,
  vacated,
  footer,
}: EventDepartureEmailProps) {
  const happened =
    reason === "left"
      ? `${departedName} left ${organizationName}`
      : reason === "removed"
        ? removedByName
          ? `${removedByName} removed ${departedName} from ${organizationName}`
          : `${departedName} was removed from ${organizationName}`
        : `${departedName} deleted their account`;

  const one = vacated.length === 1;
  // Nothing here is the recipient's to act on: every spot is somebody else's.
  const headsUp = vacated.every((spot) => spot.headsUp);

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {happened} — {one ? "an event needs" : `${vacated.length} events need`} people
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
                {headsUp ? "Heads-up: " : ""}
                {one ? "Role Left Open" : "Roles Left Open"}
              </Text>
              <Text className="m-0 mt-2 text-sm text-gray-500">
                {happened}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, that leaves{" "}
                {one ? "an upcoming event" : `${vacated.length} upcoming events`}
                {headsUp ? "" : " you manage"} short.
              </Text>

              {vacated.map((spot) => (
                <Section
                  key={`${spot.viewLink}-${spot.roleLabel}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-left"
                >
                  <Text className="m-0 text-base font-semibold text-amber-900">
                    {spot.eventName}
                  </Text>
                  <Text className="m-0 mt-1 text-sm font-medium text-amber-900">
                    {spot.roleLabel} needed
                  </Text>
                  {spot.eventDate ? (
                    <>
                      <Text className="m-0 mt-3 text-sm text-amber-800">
                        {spot.eventDate}
                      </Text>
                      {spot.eventTime ? (
                        <Text className="m-0 mt-1 text-sm text-amber-800">
                          {spot.eventTime}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  {spot.headsUp ? (
                    <Text className="m-0 mt-3 text-sm text-amber-800">
                      {spot.headsUp}
                    </Text>
                  ) : null}
                  {/* One event gets the big button below instead. */}
                  {one ? null : (
                    <Link
                      href={spot.viewLink}
                      className="mt-3 inline-block text-sm font-semibold text-gray-900 underline"
                    >
                      {spot.headsUp ? "View this event" : "Staff this event"}
                    </Link>
                  )}
                </Section>
              ))}

              {one ? (
                <Button
                  href={vacated[0].viewLink}
                  className="mt-2 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
                >
                  {headsUp ? "View Event" : "Staff This Event"}
                </Button>
              ) : null}

              {headsUp ? null : (
                <Text className="m-0 mt-6 text-xs text-gray-500">
                  From {one ? "the" : "each"} event&apos;s Team card you can
                  invite somebody else into the role.
                </Text>
              )}

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                {footer ??
                  `You're receiving this because you manage ${one ? "this event" : "these events"} at ${organizationName}.`}
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
