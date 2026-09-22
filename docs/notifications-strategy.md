# Notification & reminder strategy

Draft — decisions to make before writing code. Nothing here is implemented yet.

The question this answers: **who hears about what is happening to an event, how
often, and through which channel** — with NHC's `OWNER` / `ADMIN` / `MEMBER`
model and the email infrastructure already in `lib/email/`.

---

## 1. Where we actually are

### What already sends mail

Thirteen send sites, eleven templates. Every one is a direct consequence of a
single mutation — there is no scheduling, bundling, or preference layer anywhere.

| Trigger | Recipients | Site |
| --- | --- | --- |
| Org invite sent / resent | Invitee | `lib/actions/invitation.ts:111`, `:386` |
| Assigned to event (create, bulk invite, resend, smart-fill) | Invitee | `lib/actions/event.ts:379`, `:739`, `:1036`, `:1601` |
| **Volunteer declined** | `eventStaffingRecipients` | `lib/actions/event.ts:653` |
| Removed from event | Removed volunteer | `lib/actions/event.ts:902` |
| Event canceled | Whole roster | `lib/actions/event.ts:1734` |
| Event details changed | Whole roster | `lib/actions/event.ts:2109` |
| Admin broadcast (event) | Accepted volunteers | `lib/actions/event.ts:1864` |
| Admin broadcast (org) | All members | `lib/actions/organizations.ts:420` |
| **Invite lapsed** | Invite sender → creator → owners | `app/api/cron/expire-invitations/route.ts:128` |

### The asymmetry

Bold the two rows above and the shape of the problem appears:

> **Every notification an admin receives today is bad news.**

`acceptEventInvitation` (`lib/actions/event.ts:495`) writes the status, logs
`INVITE_ACCEPTED`, busts four cache tags, and mails **nobody**. An admin who
staffs a 12-person event and walks away learns nothing until they open the
dashboard. They get mail when someone declines, and mail when someone ignores
the invite — and silence when the thing works.

That is the actual gap. It is not "we need more notifications"; it is that the
notification surface only reports failure, so the product feels like it is
nagging rather than reporting.

### What we can build on

The plumbing is better than it looks. Reuse it, don't rewrite it:

- **`sendEmailBatches`** (`lib/email/send.ts:26`) — chunks at 100/request
  because Resend allows 10 req/s per team. Best-effort, logs failures. Every
  new sender goes through this.
- **`eventStaffingRecipients`** (`lib/email/recipients.ts:23`) — creator if
  they are still a non-`MEMBER` of the org, else **all owners**. Documented as
  never returning an empty list. This is already the right escalation spine.
- **`inviteSenderRecipients`** (`lib/email/recipients.ts:66`) — resolves the
  specific admin who sent a given invite, matched as `org:user` pairs.
- **`organizationSender`** — org-branded `From:`, RFC 5322-quoted.
- **`sameSchedule`** (`lib/email/event-when.ts`) — the precedent for *don't
  mail when nothing actually changed*. `editEventDetails` deletes and recreates
  every `EventDate` row on save, so comparing rows would mail the whole team
  on a typo fix. Any digest needs the same instinct.
- **`ActivityLog`** — org-wide feed with snapshotted display strings, already
  paginated and cached (`lib/services/activity.ts`). This is the read model an
  in-app inbox would sit next to.
- **The cron pattern** — `CRON_SECRET` + `timingSafeEqual`, `SWEEP_LIMIT`,
  `updateManyAndReturn` as an atomic claim, `revalidateTag(tag, { expire: 0 })`.
- **Ably** (`lib/realtime/`) — currently only `event:${eventId}:chat`. An org
  notification channel is a small extension of an adapter that already exists.

### Two things the cron already solved that the rest of the system hasn't

`notifyLapsedAssignments` is, quietly, the most sophisticated notification code
in the repo. It already answers two of the questions below:

1. **Bundling.** It buckets by `` `${eventId}:${recipient.email}` `` so an admin
   who invited five people to one event gets **one** email listing five roles,
   not five emails. That bucketing loop is the digest pattern, already written
   and already shipped.
2. **Staleness.** Before sending, it groups `ACCEPTED` assignments and drops any
   role that has since been filled — because *"needs a Pianist"* about an event
   with a confirmed pianist "is the kind of wrong that stops people reading the
   mail." Every scheduled notification needs that same check at send time, not
   at enqueue time.
3. **Backlog suppression.** `NOTIFY_WINDOW_HOURS = 6` stops a paused cron from
   mailing months of lapses at once when it resumes.

Generalize these three out of the cron rather than reinventing them per feature.

---

## 2. How the comparable products do it

### Planning Center Services — the closest analog

This is the direct competitor (church volunteer scheduling), and it has already
converged on answers to the exact questions in this doc:

- **It bundles admin notifications by kind.** Per their own writeup, PCO
  "reduces the number of emails your team receives by bundling Scheduling
  Requests, Blockout Notifications, and **Accepted Request Notifications**."
  Accepts are explicitly a *bundled* category, not a per-event alert.
- **Volunteer reminders condense per person, not per assignment.** "Any
  reminders scheduled to be sent on the same day will be condensed into one
  reminder notification so that people assigned to more than one team won't
  receive a separate notification for each team." The dedupe key is
  `(person, day)` — not `(person, assignment)`.
- **It auto-reschedules declined requests**, which is our
  `smartSchedulingEnabled` path.

The convergent-evolution read: they shipped per-assignment emails first, users
drowned, and they retrofitted bundling. We can skip that step.

### Calendly — the reminder ladder

Reminders are configurable "Workflows" hung off the booking, with the house
default being **two touches: ~24h out by email and ~30min out by SMS**. Hosts
get an immediate notification on each booking — but Calendly is 1:1, so "each
booking" *is* the whole event. That model does not transfer to a 12-person
roster, and this is the single most common mistake to avoid here.

### Linear / Asana / Monday — the inbox model

The pattern worth stealing wholesale:

> **In-app is the source of truth. Email is a fallback for what you didn't read.**

Linear delays notification email and **only sends it if you haven't already
read the in-app notification**, with the delay scaled to urgency. Monday and
Asana do the same thing with a bell icon plus a rolled-up digest.

This inverts the naive model. Instead of *"which events deserve an email?"* the
question becomes *"everything lands in the inbox; what escalates out of it?"* —
which is a much easier question to answer correctly, and it makes over-notifying
structurally impossible rather than a matter of taste.

---

## 3. Recommendations

### 3.1 Who to notify — actor-scoped, with role escalation

**Do not notify all owners and admins on ordinary activity.** A 5-admin org
running a 12-person event would generate 60 emails for an event that went
perfectly. The existing `eventStaffingRecipients` ladder is already correct;
apply it consistently:

| Tier | Who | When |
| --- | --- | --- |
| 1 | The admin who **took the action** (sent that invite) | Default for anything about that invite |
| 2 | The **event creator** | When tier 1 is gone/demoted, or the signal is about the event as a whole |
| 3 | **All owners** | Safety net only — tiers 1–2 unresolvable, or a deadline escalation |

Owners are a **backstop, not an audience**. The one case for deliberately
reaching every owner/admin is the terminal escalation in §3.3 — an event about
to happen understaffed, where the org genuinely has a problem. That is rare by
construction, which is exactly what makes it worth reading.

Worth adding: a per-event **watcher** concept, so a worship pastor who did not
create Sunday's service can opt into its staffing signals without being an
owner. Cheap to model (`EventWatcher` join table), and it removes most of the
pressure to broadcast to roles.

### 3.2 Individual accepts vs. pending digest — neither, actually

This was the framing question, and I think it is the wrong axis. Both options
are bad:

- **Per-accept email** → 12 emails for a well-staffed event, all saying "things
  are fine." Admins filter them within a week, and the filter also eats the
  decline notices that actually matter.
- **Pending digest** → a recurring email whose content is "still waiting," which
  is not actionable and trains people to ignore it.

**Notify on staffing-state transitions, not on individual responses.**

Derive a state per `(event, role)` — and per event overall — from the
assignments that already exist:

```
UNSTAFFED  → no accepted assignment for a needed role
PARTIAL    → some roles filled, some open
FULL       → every entry in rolesNeeded has an ACCEPTED assignment
AT_RISK    → still not FULL inside the escalation window (§3.3)
```

Then mail only on the **edges**:

- `→ FULL` — *"Sunday Service is fully staffed."* Once. High value, ends the
  admin's open loop, and it is the first genuinely good news the product would
  ever send. Ship this first.
- `FULL → PARTIAL` — a late decline after the event was complete. Higher
  urgency than an ordinary decline, and worth a distinct subject line.
- `→ AT_RISK` — the escalation ladder below.

Individual accepts go to the **activity feed and the in-app inbox** (both nearly
free — `logActivity` already writes `INVITE_ACCEPTED`), never to email. An admin
who wants per-accept granularity opens the event; the dashboard is the right
surface for "who has answered so far," not the inbox.

This is the same conclusion PCO reached by bundling accepted requests, arrived
at from the other direction.

### 3.3 Cadence — anchor reminders to two different clocks

The critical distinction: **an invite deadline and an event date are different
clocks, and they need different ladders.**

**Ladder A — to the volunteer, anchored on `EventAssignment.expiresAt`**
(the invite is going stale):

| When | Who | Note |
| --- | --- | --- |
| T-48h before expiry | Volunteer, if still `PENDING` | Skip if the window is shorter than 48h |
| T-12h before expiry | Volunteer, if still `PENDING` | Last call; say the deadline explicitly |
| On expiry | Admin | **Already built** — the cron |

**Ladder B — to the volunteer, anchored on the event date** (you said yes,
don't forget):

| When | Who |
| --- | --- |
| T-7d | Accepted volunteers — mirrors PCO's weekly rhythm |
| T-24h | Accepted volunteers, condensed per person per day |

Ladder B is where PCO's `(person, day)` dedupe matters: someone playing at both
a Saturday rehearsal and a Sunday service should get one reminder, not two.

**Ladder C — to admins, anchored on the event date** (staffing escalation):

| When | Condition | Who |
| --- | --- | --- |
| T-7d | Not `FULL` | Creator (tier 2) |
| T-48h | Not `FULL` | Creator + all admins/owners (tier 3) |

**Hard caps**, non-negotiable: at most **one staffing email per admin per event
per 24h**, and at most **one reminder per volunteer per day** across all
ladders. Enforce in the sender, not in each call site.

### 3.4 Channel strategy — build the inbox before more email

Sequence matters. Adding ladders A–C on top of today's thirteen senders, with no
inbox and no preferences, makes the product noisier without making it better.

1. **In-app inbox** — a `Notification` table + a bell in
   `components/dashboard/navbar/`. Everything lands here. Cheap to write
   alongside `logActivity`.
2. **Email as escalation** — the Linear rule: send only if the in-app
   notification is still unread after a delay (~10–15 min for routine, immediate
   for terminal escalations). This alone would cut volume substantially for
   active admins while leaving the disengaged fully covered.
3. **SMS, last.** `twilio` is already a dependency and `User.phoneNumber` is
   already synced from Clerk (`app/api/webhooks/route.ts:34`) — the code is
   sitting commented out at `lib/actions/invitation.ts:26,125`. Reserve it for
   the T-24h event reminder and the T-48h AT_RISK escalation only. SMS is the
   channel that makes people quit, and it costs real money per send. Consider
   gating it behind a Stripe entitlement (`lib/billing/entitlements.ts`), which
   is both a monetization hook and a natural volume limiter.

---

## 4. What has to be built first (prerequisites)

These are not optional and they are not features. Anything in §3 that ships
without them will be wrong in a way that is expensive to unwind.

### 4.1 Organizations need a real timezone — blocking

Right now **every** datetime in the product is floating UTC wall-clock. The
create form appends `Z` to whatever the admin typed, and `lib/email/event-when.ts`
pins `timeZone: "UTC"` on every format precisely because of that.

That works for *displaying* a time somebody typed. It completely fails for
*deciding when to send*. "T-24h before a 9am service" and "the 8am Monday
digest" both require knowing what 8am means for that org. Without it, a Pacific
church gets its morning digest at midnight.

```prisma
model Organization {
  timeZone String @default("America/New_York")  // IANA
}
```

Add it, expose it in org settings, and have the scheduler resolve send times
through it. Leave `event-when.ts` alone — it is correct for what it does.

### 4.2 Reminders need a dedupe key — blocking

The existing cron gets deduplication **for free** from the `PENDING → EXPIRED`
transition: a flipped row can never be selected again, so nobody is mailed
twice. That is why it is safe as a bare hourly sweep with no extra state.

**Reminders have no such transition.** Sending a T-48h reminder mutates nothing,
so the next hourly tick sends it again. And again. This is the single biggest
engineering risk in the whole plan.

Recommended: a notification log where a unique constraint does the work —
mirroring how `@@unique([eventId, userId])` already guards assignments.

```prisma
model Notification {
  id             String   @id @default(uuid())
  type           NotificationType
  // e.g. "reminder:t48:assignment:<id>" or "staffing:full:event:<id>"
  // A insert conflict IS the "already sent" check. No read-then-write race.
  dedupeKey      String   @unique

  userId         String
  organizationId String
  eventId        String?

  // Snapshotted like ActivityLog, so a row survives its event's deletion.
  title          String
  body           String?

  readAt         DateTime?   // drives the Linear-style email suppression
  emailedAt      DateTime?
  createdAt      DateTime @default(now())

  @@index([userId, organizationId, readAt])
  @@index([eventId])
}
```

This one table does triple duty: dedupe key, in-app inbox read model, and the
read-state signal that decides whether email escalates. Build it once.

### 4.3 Preferences

Start coarse. A `NotificationPreference` row per `(user, organization)` with a
handful of booleans and a digest-time field beats a per-type matrix nobody will
configure. Org-level defaults set by owners, user-level overrides.

The one thing worth having on day one is a **mute/DND window**, so the T-12h
ladder cannot fire at 3am.

### 4.4 Scheduler shape

`vercel.json` runs one hourly cron. Reminder ladders need finer resolution than
that, but probably not much finer:

- Keep `expire-invitations` hourly and untouched.
- Add `/api/cron/notifications` at **every 15 min**, which is precise enough for
  T-48h/T-24h/T-12h windows and cheap.
- Reuse the sweep discipline verbatim: `CRON_SECRET` + `timingSafeEqual`, a
  `SWEEP_LIMIT` cap, a `NOTIFY_WINDOW` backlog guard, and — critically — the
  **re-check-at-send-time** pattern from `notifyLapsedAssignments`. A reminder
  queued at T-48h must re-verify the invite is still `PENDING` and the role
  still unfilled at the moment it sends.

---

## 5. Suggested order of work

Each step is independently shippable and independently valuable.

1. **`Organization.timeZone`** + settings UI. Unblocks everything. Small.
2. **`→ FULL` staffing email.** One new template, hooks into the existing
   `acceptEventInvitation`, uses `eventStaffingRecipients` unchanged. The first
   good news the product sends, and it needs no new infrastructure.
3. **`Notification` table + bell.** The inbox. Write alongside `logActivity` at
   every existing call site; no new email.
4. **`/api/cron/notifications` + Ladder A** (invite expiry reminders to
   volunteers). Directly reduces lapse rate, which reduces the admin notices we
   already send.
5. **Ladder B** (event reminders, condensed per person per day).
6. **Email-escalates-on-unread.** Retrofit the Linear rule across senders. This
   is where total volume drops.
7. **Ladder C** (admin AT_RISK escalation) + preferences.
8. **SMS**, entitlement-gated, for T-24h and AT_RISK only.

---

## 6. Open questions — decide before step 2

- **Should `→ FULL` fire per role or per event?** Per event is calmer. Per role
  is more useful for a worship pastor who only cares that they have a drummer.
  Possibly both, as a preference.
- **Does a smart-fill acceptance count as newsworthy?** The admin never invited
  that person — the system did. Argument for: they should know who is actually
  playing. Argument against: `AUTO_INVITE_SENT` already lands in the feed, and
  the point of auto-fill is that it handles it. Leaning: feed only, unless it
  completes the event (then it is a `→ FULL` anyway).
- **Is the org-wide activity feed a notification surface or an audit log?** It
  is currently an audit log. If the inbox in §4.2 is per-user, these stay
  separate and the feed keeps doing what it does. Worth confirming before
  building the bell, since merging them later is painful.
- **How does this interact with `autoAssigned`?** An auto-assigned volunteer
  never opted into that slot. Should their reminder ladder be more aggressive
  (they are less likely to be expecting it) or less (they did not ask for it)?
- **Per-org volume ceiling?** Resend is 10 req/s per team, and
  `sendEmailBatches` already chunks for it — but that is a *platform-wide*
  budget being spent by individual orgs' crons. Worth modeling before ladders
  A–C multiply send volume.

---

## Sources

- [Planning Center: Bundled Scheduling & Notification Emails](https://www.planningcenter.com/blog/2018/06/bundled-email-and-notifications)
- [Planning Center: Set up reminder emails](https://help.planningcenter.com/en/142894-set-up-reminder-emails.html)
- [Planning Center: Send scheduling emails](https://help.planningcenter.com/en/142892-send-scheduling-emails.html)
- [Planning Center: Auto-reschedule declined volunteer requests](https://www.planningcenter.com/blog/2024/09/auto-reschedule-declined-volunteer-requests-in-services)
- [Linear Docs: Notifications](https://linear.app/docs/notifications)
- [Linear Docs: Inbox](https://linear.app/docs/inbox)
- [Calendly: Workflows & notifications](https://calendly.com/help/workflows-notifications)
- [Calendly: Guide to reminders](https://calendly.com/blog/guide-calendly-reminders)
