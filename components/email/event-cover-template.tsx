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

const names = new Intl.ListFormat("en", { type: "conjunction" });

interface EventCoverEmailProps {
  recipientName: string;
  organizationName: string;
  logoUrl: string | null;
  eventName: string;
  // Preformatted by `formatEventWhen`, which pins UTC. Null when the event
  // carried no dates.
  eventDate: string | null;
  eventTime: string | null;
  /** The teams they cover, e.g. "Band" or "Band and Vocals". */
  teamLabels: string;
  /** The same teams as a choice, e.g. "Band or Vocals": "when a … spot opens up". */
  teamChoice: string;
  /** Every role in those teams, e.g. "Pianist, Aux Keys, Bassist". */
  roleLabels: string;
  /** First names of whoever usually leads those teams; none when the service type has no lead. */
  regularLeads: string[];
  assignedByName: string;
  viewLink: string;
}

export default function EventCoverEmail({
  recipientName,
  organizationName,
  logoUrl,
  eventName,
  eventDate,
  eventTime,
  teamLabels,
  teamChoice,
  roleLabels,
  regularLeads,
  assignedByName,
  viewLink,
}: EventCoverEmailProps) {
  const handBack =
    regularLeads.length > 0
      ? ` ${names.format(regularLeads)} ${regularLeads.length > 1 ? "take" : "takes"} over again from the next event.`
      : "";

  return (
    <Tailwind>
      <Html>
        <Head />
        <Preview>
          You&apos;re covering {teamLabels} for {eventName}
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
                You&apos;re Covering {teamLabels}
              </Text>
            </Section>

            <Section className="px-8 py-6 text-center">

              <Text className="m-0 mb-6 text-sm text-gray-600">
                Hi {recipientName}, {assignedByName} asked you to cover{" "}
                {teamLabels} for this event. If a {teamChoice} spot opens up,
                you&apos;ll be asked to fill it.{handBack}
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
                <Text className="m-0 mt-3 mb-1 text-xs text-gray-500">
                  {teamLabels} roles
                </Text>
                <Text className="m-0 text-sm font-medium text-gray-900">
                  {roleLabels}
                </Text>
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
                You&apos;re receiving this because you&apos;re covering{" "}
                {teamLabels} for this event at {organizationName}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}
