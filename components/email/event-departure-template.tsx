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
  /** `formatEventWhen`'s date and time, joined. Null when the event has no dates. */
  when: string | null;
  viewLink: string;
};

interface EventDepartureEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  departedName: string;
  reason: "left" | "removed" | "deleted";
  /** Every upcoming event of the recipient's this leaves short, soonest first. */
  vacated: VacatedSpot[];
}

export default function EventDepartureEmail({
  recipientName,
  organizationName,
  logoUrl,
  departedName,
  reason,
  vacated,
}: EventDepartureEmailProps) {
  const what =
    reason === "left"
      ? `left ${organizationName}`
      : reason === "removed"
        ? `was removed from ${organizationName}`
        : "deleted their account";

  const one = vacated.length === 1;

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          {departedName} {what} — {one ? "an event needs" : `${vacated.length} events need`} people
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
                {one ? "Role Left Open" : "Roles Left Open"}
              </Text>
              <Text className="mt-2 text-sm text-gray-500 m-0">
                {departedName} {what}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="text-sm text-gray-600 m-0 mb-6">
                Hi {recipientName}, {departedName} was on{" "}
                {one ? "an upcoming event" : `${vacated.length} upcoming events`}{" "}
                you manage, and {one ? "that role has" : "those roles have"}{" "}
                nobody confirmed now.
              </Text>

              {vacated.map((spot) => (
                <Section
                  key={`${spot.viewLink}-${spot.roleLabel}`}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-3 text-left"
                >
                  <Text className="text-base font-semibold text-amber-900 m-0">
                    {spot.eventName}
                  </Text>
                  <Text className="mt-1 text-sm text-amber-800 m-0">
                    Needs a {spot.roleLabel}
                    {spot.when ? ` · ${spot.when}` : ""}
                  </Text>
                  {/* One event gets the big button below instead. */}
                  {one ? null : (
                    <Link
                      href={spot.viewLink}
                      className="mt-2 inline-block text-sm font-semibold text-gray-900 underline"
                    >
                      Staff this event
                    </Link>
                  )}
                </Section>
              ))}

              {one ? (
                <Button
                  href={vacated[0].viewLink}
                  className="mt-3 rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white no-underline"
                >
                  Staff This Event
                </Button>
              ) : null}

              <Text className="mt-6 text-xs text-gray-500 m-0">
                From each event&apos;s Team card you can invite somebody else
                into the role.
              </Text>

            </Section>

            <Section className="border-t border-gray-200 px-8 py-6">
              <Text className="text-center text-xs text-gray-400 m-0">
                You&apos;re receiving this because you manage{" "}
                {one ? "this event" : "these events"} at {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
