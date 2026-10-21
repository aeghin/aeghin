import "server-only";

import prisma from "@/lib/prisma";
import { InvitationStatus } from "@/generated/prisma/enums";
import EventRehearsalReminderEmail from "@/components/email/event-rehearsal-reminder-template";
import EventReminderEmail from "@/components/email/event-reminder-template";
import { volunteerRoleConfig } from "@/lib/config/roles";
import { formatEventShort, formatEventWhen, formatRehearsal } from "@/lib/email/event-when";
import { dayKey } from "@/lib/event-format";
import { organizationSender } from "@/lib/email/organization";
import { sendEmailBatches } from "@/lib/email/send";
import type { SendCount } from "@/lib/notifications/unanswered";
import { sendPushNotices, type PushNotice } from "@/lib/push/send";
import {
  daysBefore,
  inZone,
  isDue,
  wakingSameDay,
  zonesByEmail,
} from "@/lib/push/timing";
import { zoneOrFallback } from "@/lib/time-zone";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far ahead the reminder query looks. Wide enough for every zone and for
 * the move into waking hours; the exact test is made per person.
 */
const REMINDER_HORIZON_MS = 2 * DAY_MS;

/** Reminder candidates read per query. Every page is read; this only bounds each. */
const REMINDER_PAGE = 500;

const firstStartOf = (dates: { startTime: Date }[]) =>
  new Date(Math.min(...dates.map((date) => date.startTime.getTime())));

/**
 * Reminds everybody who accepted an event, the day before its first block:
 * "Tomorrow: Sunday Service".
 *
 * By email and push together, at the event's own time of day on each person's
 * clock: a 9am service reminds at 9am the day before, wherever the church is.
 * Kept inside 6am to 10pm — a 5am service reminds at 6am, an 11pm one at 10pm —
 * and always on the day before, so "Tomorrow" stays true. The clock is the
 * zone their phone reports; somebody whose phone never has — usually somebody
 * without the app — gets the email alone, planned on the organization's clock.
 *
 * Claimed on `reminderSentAt` before sending, so overlapping ticks can't both
 * send it, and sent once per schedule: moving the event clears the claim. One
 * that came due too long ago is skipped rather than sent late, which also
 * covers accepting within the day — they know it's tomorrow.
 *
 * Paged rather than capped: the window holds every accepted spot for the next
 * two days, most not due yet, and a cap would let those crowd out the ones
 * that are.
 *
 * Returns how many of each were sent.
 */
export async function sendDayBeforeReminders(now: Date): Promise<SendCount> {
  const count: SendCount = { pushes: 0, emails: 0 };
  let after: string | undefined;

  for (;;) {
    const rows = await prisma.eventAssignment.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        status: InvitationStatus.ACCEPTED,
        reminderSentAt: null,
        event: {
          dates: {
            some: {
              startTime: {
                gt: now,
                lte: new Date(now.getTime() + REMINDER_HORIZON_MS),
              },
            },
          },
        },
      },
      select: {
        id: true,
        role: true,
        user: { select: { email: true, firstName: true } },
        event: {
          select: {
            id: true,
            name: true,
            location: true,
            organizationId: true,
            rehearsalStart: true,
            rehearsalEnd: true,
            dates: { select: { startTime: true, endTime: true } },
            organization: { select: { name: true, logoUrl: true, timeZone: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: REMINDER_PAGE,
    });

    if (rows.length === 0) return count;

    const zones = await zonesByEmail(rows.map((row) => row.user.email));

    const due = rows.flatMap((row) => {
      if (row.event.dates.length === 0) return [];

      const phoneZone = zones.get(row.user.email);
      // The clock it's planned on: their phone's, else the organization's.
      const clock = phoneZone ?? zoneOrFallback(row.event.organization.timeZone);

      try {
        const sendAt = inZone(
          wakingSameDay(daysBefore(firstStartOf(row.event.dates), 1)),
          clock,
        );

        return isDue(sendAt, now, clock) ? [{ row, phoneZone }] : [];
      } catch {
        // A zone this runtime can't resolve: no reminder, rather than no tick.
        return [];
      }
    });

    if (due.length > 0) {
      const claimed = await prisma.eventAssignment.updateManyAndReturn({
        where: {
          id: { in: due.map(({ row }) => row.id) },
          status: InvitationStatus.ACCEPTED,
          reminderSentAt: null,
        },
        data: { reminderSentAt: now },
        select: { id: true },
      });

      const claimedIds = new Set(claimed.map((row) => row.id));

      const sending = due
        .filter(({ row }) => claimedIds.has(row.id))
        .map(({ row, phoneZone }) => {
          const { event } = row;

          // Only a rehearsal still ahead: most are days earlier, and done by
          // now. Ahead at the church, whose wall clock it's written in.
          const rehearsal =
            event.rehearsalStart &&
            inZone(event.rehearsalStart, zoneOrFallback(event.organization.timeZone)).getTime() >
              now.getTime()
              ? formatRehearsal(event.rehearsalStart, event.rehearsalEnd)
              : null;

          return { row, phoneZone, rehearsal };
        });

      const emails = sending.map(({ row: { event, role, user }, rehearsal }) => {
        const when = formatEventWhen(event.dates);

        return {
          from: organizationSender(event.organization.name),
          to: user.email,
          subject: `Tomorrow: ${event.name}`,
          react: EventReminderEmail({
            recipientName: user.firstName,
            eventName: event.name,
            organizationName: event.organization.name,
            logoUrl: event.organization.logoUrl,
            roleLabel: volunteerRoleConfig[role].label,
            eventDate: when?.date ?? null,
            eventTime: when?.time ?? null,
            location: event.location,
            rehearsal,
            viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${event.organizationId}/events/${event.id}`,
          }),
        };
      });

      // Pushed only to a phone that has reported its zone, whose clock it was
      // planned on.
      const notices: PushNotice[] = sending
        .filter(({ phoneZone }) => phoneZone)
        .map(({ row: { event, role, user }, rehearsal }) => ({
          email: user.email,
          title: `Tomorrow: ${event.name}`,
          subtitle: event.organization.name,
          body: [
            [volunteerRoleConfig[role].label, formatEventShort(event.dates)]
              .filter(Boolean)
              .join(" · "),
            rehearsal && `Rehearsal ${rehearsal}`,
            event.location,
          ]
            .filter(Boolean)
            .join("\n"),
          data: {
            type: "event",
            organizationId: event.organizationId,
            eventId: event.id,
          },
        }));

      await sendEmailBatches("day-before reminder", emails);
      await sendPushNotices("day-before reminder", notices);

      count.emails += emails.length;
      count.pushes += notices.length;
    }

    if (rows.length < REMINDER_PAGE) return count;

    after = rows[rows.length - 1].id;
  }
}

/**
 * Reminds everybody who accepted an event, the day before its rehearsal:
 * "Tomorrow: rehearsal for Sunday Service".
 *
 * Planned and claimed exactly as the day-before reminder is, on the
 * rehearsal's time of day instead of the event's: by email and push together,
 * inside waking hours on each person's clock, the email alone for somebody
 * whose phone has never reported a zone. Claimed on `rehearsalReminderSentAt`,
 * which moving the rehearsal clears.
 *
 * Only for a rehearsal on an earlier day than the event. One on the event's
 * own day is still ahead when "Tomorrow: Sunday Service" goes, and that
 * reminder already lists it, so this would be the same news twice.
 *
 * Returns how many of each were sent.
 */
export async function sendRehearsalReminders(now: Date): Promise<SendCount> {
  const count: SendCount = { pushes: 0, emails: 0 };
  let after: string | undefined;

  for (;;) {
    const rows = await prisma.eventAssignment.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        status: InvitationStatus.ACCEPTED,
        rehearsalReminderSentAt: null,
        event: {
          rehearsalStart: {
            gt: now,
            lte: new Date(now.getTime() + REMINDER_HORIZON_MS),
          },
        },
      },
      select: {
        id: true,
        role: true,
        user: { select: { email: true, firstName: true } },
        event: {
          select: {
            id: true,
            name: true,
            location: true,
            organizationId: true,
            rehearsalStart: true,
            rehearsalEnd: true,
            dates: { select: { startTime: true, endTime: true } },
            organization: { select: { name: true, logoUrl: true, timeZone: true } },
          },
        },
      },
      orderBy: { id: "asc" },
      take: REMINDER_PAGE,
    });

    if (rows.length === 0) return count;

    const zones = await zonesByEmail(rows.map((row) => row.user.email));

    const due = rows.flatMap((row) => {
      const { rehearsalStart, dates } = row.event;

      if (!rehearsalStart || dates.length === 0) return [];
      if (dayKey(rehearsalStart) >= dayKey(firstStartOf(dates))) return [];

      const phoneZone = zones.get(row.user.email);
      const clock = phoneZone ?? zoneOrFallback(row.event.organization.timeZone);

      try {
        const sendAt = inZone(wakingSameDay(daysBefore(rehearsalStart, 1)), clock);

        return isDue(sendAt, now, clock) ? [{ row, phoneZone, rehearsalStart }] : [];
      } catch {
        // A zone this runtime can't resolve: no reminder, rather than no tick.
        return [];
      }
    });

    if (due.length > 0) {
      const claimed = await prisma.eventAssignment.updateManyAndReturn({
        where: {
          id: { in: due.map(({ row }) => row.id) },
          status: InvitationStatus.ACCEPTED,
          rehearsalReminderSentAt: null,
        },
        data: { rehearsalReminderSentAt: now },
        select: { id: true },
      });

      const claimedIds = new Set(claimed.map((row) => row.id));

      const sending = due
        .filter(({ row }) => claimedIds.has(row.id))
        .map((item) => ({
          ...item,
          rehearsal: formatRehearsal(item.rehearsalStart, item.row.event.rehearsalEnd) ?? "",
        }));

      const emails = sending.map(({ row: { event, role, user }, rehearsal }) => {
        const when = formatEventWhen(event.dates);

        return {
          from: organizationSender(event.organization.name),
          to: user.email,
          subject: `Tomorrow: rehearsal for ${event.name}`,
          react: EventRehearsalReminderEmail({
            recipientName: user.firstName,
            eventName: event.name,
            organizationName: event.organization.name,
            logoUrl: event.organization.logoUrl,
            roleLabel: volunteerRoleConfig[role].label,
            rehearsal,
            eventDate: when?.date ?? null,
            eventTime: when?.time ?? null,
            location: event.location,
            viewLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/organizations/${event.organizationId}/events/${event.id}`,
          }),
        };
      });

      const notices: PushNotice[] = sending
        .filter(({ phoneZone }) => phoneZone)
        .map(({ row: { event, role, user }, rehearsal }) => ({
          email: user.email,
          title: `Tomorrow: rehearsal for ${event.name}`,
          subtitle: event.organization.name,
          body: [
            `Rehearsal ${rehearsal}`,
            [volunteerRoleConfig[role].label, formatEventShort(event.dates)]
              .filter(Boolean)
              .join(" · "),
            event.location,
          ]
            .filter(Boolean)
            .join("\n"),
          data: {
            type: "event",
            organizationId: event.organizationId,
            eventId: event.id,
          },
        }));

      await sendEmailBatches("rehearsal reminder", emails);
      await sendPushNotices("rehearsal reminder", notices);

      count.emails += emails.length;
      count.pushes += notices.length;
    }

    if (rows.length < REMINDER_PAGE) return count;

    after = rows[rows.length - 1].id;
  }
}
