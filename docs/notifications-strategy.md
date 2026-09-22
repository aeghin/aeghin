# Notification & reminder strategy

Draft — decisions to make before writing code. Nothing here is implemented yet.

The question this answers: **who hears about what is happening to an event, how
often, and through which channel** — with NHC's `OWNER` / `ADMIN` / `MEMBER`
model and the email infrastructure already in `lib/email/`.

Revised after user feedback: *"used to being notified, and not having to open
the app to check."* That pushback was correct and changed two recommendations —
see §2 (why the Linear inbox model does not transfer), §3.2 (the silence
problem), and §3.4 (push is a missing channel, not a policy question).

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

### Linear / Asana / Monday — the inbox model, and why it does not transfer

The pattern these converge on is: **in-app is the source of truth, email is a
fallback for what you didn't read.** Linear delays notification email and only
sends it if you haven't already read the in-app notification.

An earlier draft of this doc recommended adopting that model. **That was wrong
for this product**, and a current user said so directly:

> He's used to being notified, and not having to open the app to check.

The rule that model depends on is unstated and load-bearing: **it assumes a
daily-driver tool.** Linear, Asana and Monday are where their users spend the
workday, so "read it in-app within 15 minutes" is the common case and email is
genuinely the exception.

Aeghin is a twice-a-week tool. A worship pastor opens it Tuesday to plan Sunday
and maybe again Saturday. Volunteers open it when an email tells them to. Under
that engagement pattern, "email only if the in-app notification is still unread"
degrades to "email always, 15 minutes late" — an inbox whose only measurable
effect is latency. Strictly worse than sending the mail.

**Engagement frequency is the variable that decides notification architecture.**
High-frequency tools can treat the app as the channel and email as escalation.
Low-frequency tools must treat the outbound channel as primary and the app as
the place you go when a notification has already told you there is something
worth going for. PCO, Calendly and every reminder product in this space are
built the second way — that is not a coincidence.

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

**Directly, on "just the creator?"** — yes for routine signals, no for the
escalation, and never by reading `createdById` yourself:

- **Digest and `gap → 0`** → the creator. They opened the loop; they should get
  it closed. Use `eventStaffingRecipients` rather than the raw column —
  `Event.createdById` is nullable and `SetNull`, so it empties when the account
  is deleted, and the creator may have left the org or been demoted to `MEMBER`
  (who cannot staff an event anyway). That helper already handles all three and
  is documented as never returning an empty list.
- **T-3 escalation** → creator *and* all admins/owners. This is the one place
  role-broadcast is correct, and it stays meaningful precisely because it is rare.
- **Declines and lapses** → already correct: the admin who sent that invite,
  falling back through creator to owners.

The failure mode of creator-only is worth naming: **the person who creates an
event is often not the person who staffs it.** A recurring service spun up from
a template gets its creator set to whoever clicked the button that week, and
`EventTemplate` makes that path common. The escalation covers the worst case,
but not the everyday one.

Worth adding: a per-event **watcher** concept, so a worship pastor who did not
create Sunday's service can opt into its staffing signals without being an
owner. Cheap to model (`EventWatcher` join table), and it removes most of the
pressure to broadcast to roles.

### 3.2 Individual accepts vs. pending digest — the silence problem

The framing question was per-accept email or a pending digest. I still think
per-accept-as-the-default is wrong, but the user feedback exposed a real defect
in the alternative I proposed, so both halves need stating.

**The case against per-accept as a default.** A 5-admin org running a 12-person
event generates 60 emails saying "things are fine." Admins filter the channel
within a week — and the filter also eats the decline notices that actually
matter. PCO shipped per-assignment mail first, drowned their users, and
retrofitted bundling.

**The case against pure transition notifications — which the user is right
about.** If the only admin-facing signals are `→ FULL` and `→ AT_RISK`, there is
a long silence between "invites sent" and "event complete." During that silence,
*nothing arriving* is indistinguishable from *nobody is responding*, *the emails
never sent*, and *the system is broken*. So the admin opens the app to check —
which is the exact behaviour the feature was supposed to eliminate. A pure
transition model creates an information vacuum during precisely the window when
the admin is most anxious.

**The reframe that resolves it:**

> A notification that fires only when there is news still requires you to wonder
> whether there is news. A notification that fires on a schedule you can set your
> watch by does not.

So the load-bearing piece is **a scheduled digest that sends whether or not
anything changed.** "Nothing changed" is not an empty message — it is precisely
the information the admin is currently opening the app to obtain. Most digest
implementations get this wrong by suppressing empty sends, which quietly
reintroduces the wondering.

**On the count threshold ("email once 12 have accepted").** The instinct —
don't fire per response, fire at a point that means something — is right. The
metric is not: **an absolute count carries no information without a
denominator.** 12 accepted on an event needing 20 is trouble; 12 on an event
needing 12 is done. The two want opposite emails, and the count alone cannot
tell them apart.

The number that does carry information is the **gap** — slots still open — and
the gap is what the email needs to say anyway ("still needs a drummer and two
BGVs"). Once you are computing the gap, `gap === 0` is the natural trigger, and
a count threshold stops being something you have to pick.

**The gap is not computable today** — `rolesNeeded` is a deduped set of role
types with no per-role count, so there is no denominator to subtract from. See
§4.1; this blocks the whole staffing-state model and is the first thing to fix.

**Skip intermediate thresholds.** "You're at 8 of 12" is not actionable —
nothing changes in the admin's behaviour between 8 and 11 — and every extra
threshold is another email competing with the ones that matter. The daily digest
already covers progress; let it.

**Recommended shape — three layers, all outbound:**

1. **Immediate** — declines, lapses, and `FULL → PARTIAL`. Actionable *now*.
   Mostly already built.
2. **Scheduled status digest** — one message per admin per day (org-local
   morning), listing every upcoming event with its staffing state and what is
   still open. Sends on a fixed schedule while any event is upcoming, including
   when the answer is "all five events fully staffed, nothing needed." This is
   the layer that removes "I have to open the app to check."
3. **Milestone** — `gap → 0`, once per event. Closes the open loop early
   instead of making the admin wait for tomorrow's digest. This is the only
   count-like trigger worth having, and it needs no threshold to be chosen.

Staffing state is derived from assignments that already exist:

```
UNSTAFFED  → no accepted assignment for a needed role
PARTIAL    → some roles filled, some open
FULL       → every entry in rolesNeeded has an ACCEPTED assignment
AT_RISK    → still not FULL inside the escalation window (§3.3)
```

**And give him the per-accept toggle anyway.** Default off, honoured when on,
settable per admin. Two reasons this is not a cop-out:

- **His volume is probably fine.** The 60-email disaster is a *large-org*
  problem. For a 4-volunteer team with one admin, four emails is genuinely
  useful and genuinely harmless. The right default depends on org size —
  see §7, which is measurable from data already in the database.
- One loud user should not set the default, and should not be ignored either. A
  preference costs one boolean and resolves both.

Individual accepts still land in the activity feed regardless — `logActivity`
already writes `INVITE_ACCEPTED` at `lib/actions/event.ts:~536`, so the feed is
free.

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
| T-3d | `gap > 0` | Creator **and** all admins/owners (tier 3) |

One escalation, not a ladder of them. T-3d matches the instinct behind
"3–5 days before"; T-5 is also defensible and the right pick depends on the
time-to-response data in §7 — set it as a constant, not a guess baked into
logic.

There is no T-7 rung because the daily digest (Ladder D) already reports the
gap every morning. **The escalation's value is not the information — the digest
already delivered that. It is the widened audience and the changed subject
line:** an event three days out with holes in it has stopped being one admin's
problem and become the organization's.

Condition it on **`gap > 0`, not on "pending invites exist."** Outstanding
invitations on a fully staffed event are not a problem — over-inviting is normal
and healthy — and mailing about them is exactly the false alarm that teaches
people to ignore the channel.

**Ladder D — to admins, on a fixed clock** (the "stop making me check" layer
from §3.2):

| When | Condition | Content |
| --- | --- | --- |
| Daily, org-local morning | Any event upcoming in the next 14 days | Every upcoming event, its staffing state, what is still open — **including when nothing is open** |

Ladder D is the one that is not conditional on news. Suppress it only when the
org has no upcoming events at all.

**Hard caps**, non-negotiable: at most **one staffing email per admin per event
per 24h**, and at most **one reminder per volunteer per day** across all
ladders. Enforce in the sender, not in each call site. Ladder D is exempt — it
*is* the cap, and anything it already covered should be suppressed from the
immediate layer for the rest of that day.

### 3.4 Channel strategy — outbound is primary, and push is the missing one

Revised from the earlier draft, which had this backwards.

**There is a React Native client** (`app/api/mobile/v1/*` — 50 routes,
`lib/mobile/route.ts` is written around RN's fetch cache) **and no push
notification infrastructure of any kind.** No Expo, APNs, FCM, OneSignal, or
device-token column anywhere in the schema.

That is the actual answer to "I want to be notified without opening the app."
He has the app on his phone. The channel purpose-built for reaching him there
does not exist, so the product has been routing everything through email —
which is why the complaint reads as being about notification *policy* when it
is substantially about a missing *channel*.

| Channel | State | Role |
| --- | --- | --- |
| **Push** | **Absent.** RN client exists, no infra | Primary for time-sensitive: new assignment, decline, T-24h, digest tap-through |
| **Email** | 13 senders, solid plumbing | Primary for substance and for anyone without the app; the durable record |
| **In-app inbox** | Absent | *Not* a channel. A read model + dedupe ledger (§4.3) |
| **SMS** | `twilio` installed, commented out at `lib/actions/invitation.ts:26,125`; `User.phoneNumber` already synced from Clerk (`app/api/webhooks/route.ts:34`) | Terminal escalation only — T-24h, AT_RISK |

Three rules:

- **Never gate an outbound send on in-app read state.** That was the Linear rule
  and it does not apply here (§2). Send on the schedule; let the app be where
  you act, not a condition on being told.
- **Push and email carry the same signal, deduped per person per signal.** Push
  is the tap on the shoulder, email is the detail. The `Notification.dedupeKey`
  in §4.3 is what keeps them from double-firing.
- **SMS stays last and stays gated.** It costs real money per send and it is the
  channel that makes people quit. Worth putting behind a Stripe entitlement
  (`lib/billing/entitlements.ts`) — monetization hook and natural volume limiter
  in one.

### 3.5 How to bundle — the digest *is* the bundle

"Not sure how to bundle this" is the right thing to be unsure about, because
there are two very different implementations and only one of them is worth
building.

**The hard version — time-window coalescing.** Hold a notification for N
minutes, watch for more of the same kind, merge them, flush on a timer. This is
what Slack and Linear do. It needs a pending queue, debounce timers, a flush
worker, and careful thinking about what happens when the window straddles a
deploy. **Don't build this.**

**The easy version — a fixed-schedule digest.** Accepts write nothing outbound
at all. Once a day, a cron reads current state and sends it. There is no window
to tune, no queue, no debounce, no flush — the schedule *is* the coalescing, and
state is read fresh at send time rather than accumulated.

Given Ladder D exists, the second version is free and the first is redundant.
Bundling stops being a mechanism you build and becomes a consequence of *when*
you read state:

| Signal | Bundled how |
| --- | --- |
| Accepts | Not sent individually; appear in the next digest as current state |
| Progress | The digest, daily |
| `gap → 0` | Immediate, once, no bundling needed (it can only fire once per event) |
| Declines / lapses | Immediate — already bucketed per `(event, recipient)` by the cron |
| T-3 escalation | Immediate, one per event, lists everything outstanding at once |

The one genuine bundling rule worth enforcing: **suppress from the immediate
layer anything the digest has already covered that day**, so an admin who read
the morning digest doesn't get a duplicate that afternoon.

And the mechanic to lift out of the cron rather than reinvent — it is already
written in `notifyLapsedAssignments`:

```
collect rows → key by `${eventId}:${recipient.email}` → coalesce into one bucket
→ re-verify the gap still exists at send time → one email per bucket
```

The **re-verify** step is the part people skip and the part that matters. A
digest assembled from state read an hour ago will tell someone an event needs a
drummer who accepted forty minutes back.

---

## 4. What has to be built first (prerequisites)

These are not optional and they are not features. Anything in §3 that ships
without them will be wrong in a way that is expensive to unwind.

### 4.1 Events cannot express how many people a role needs — blocking

This is the one that blocks the threshold idea, and it is a schema gap rather
than a design choice.

```prisma
model Event {
  rolesNeeded VolunteerRole[]
}
```

That array is a **set of distinct role types, not a count of slots.** It is
deduped explicitly on write — `lib/actions/event.ts:1234`:

```ts
const merged = [...new Set([...event.rolesNeeded, ...roles])];
```

So an event can say *"we need a guitarist, a drummer, and BGVs"*. It cannot say
*"we need one guitarist, one drummer, and three BGVs."* The consequences:

- **There is no denominator.** "Notify at 12 accepted" has nothing to compare 12
  against. `rolesNeeded.length` is the count of distinct role *types* — capped
  at 12 by the enum — not the number of people wanted.
- **`FULL` is currently only computable in a weak sense:** every distinct role
  has at least one `ACCEPTED` assignment. That is exactly the test the expiry
  cron already makes when it drops roles that have since been filled
  (`app/api/cron/expire-invitations/route.ts`, the `filled` set). An event
  wanting three BGVs reads as fully staffed the moment one accepts.
- **A coverage percentage is not computable at all.**

Evidence this wall has already been hit: `components/dashboard/events/event-status-card.tsx`
is a fully commented-out component whose dead code is

```ts
// const filledCount = event.acceptedVolunteers.length
// const totalSlots  = event.rolesNeeded.length
// const spotsLeft   = Math.max(0, totalSlots - filledCount)
```

…rendering "Fully staffed" or "N open". That is precisely the feature under
discussion, attempted and abandoned — almost certainly because `totalSlots`
does not mean what it needs to mean.

**The fix.** Promote roles to rows with a count:

```prisma
model EventRoleSlot {
  id      String        @id @default(uuid())
  role    VolunteerRole
  needed  Int           @default(1)

  eventId String
  event   Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([eventId, role])
  @@index([eventId])
}
```

Then `gap = Σ needed − count(ACCEPTED)` per event, and per role, and everything
in §3.2 becomes computable. `EventTemplate.rolesNeeded` needs the same
treatment so recurring services carry their counts.

Migration is the real cost: backfill one `EventRoleSlot{ needed: 1 }` per entry
in each event's existing `rolesNeeded`, which preserves today's exact semantics,
then move the ~10 read sites (`lib/actions/event.ts:233, 1234, 1314, 1343,
1445, 1580`, `components/dashboard/events/event-assignment-section.tsx:119`) over.
Not hard, but it is a day of careful work and **every staffing-state
notification depends on it.**

Worth doing regardless of notifications — "we need 3 BGVs" is a real scheduling
need that the product cannot currently express, and `event-status-card.tsx`
suggests it has already been missed once.

### 4.2 Organizations need a real timezone — blocking

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

This blocks the Ladder D digest specifically: a digest that arrives at an
unpredictable local hour is not a digest anyone can build a habit around, and
habit is the entire mechanism by which it replaces opening the app.

### 4.3 Reminders need a dedupe key — blocking

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

### 4.4 Push notifications — the largest single piece of missing work

Nothing in the schema or the API supports push. This is net-new:

- A `DeviceToken` model (`userId`, `token`, `platform`, `lastSeenAt`), with
  registration and revocation routes under `app/api/mobile/v1/`.
- A provider. Expo's push service is the least work if the RN client is an Expo
  app; APNs + FCM directly if it is bare RN. **Check which before estimating —
  it is the difference between a day and a week.**
- Token lifecycle: tokens rotate and go stale, and dead tokens must be reaped on
  provider rejection or the send queue silently rots.
- A `pushedAt` column alongside `emailedAt` on `Notification` (§4.3), so the two
  channels dedupe against one shared ledger.

Sequenced after the digest in §5 because the digest fixes the stated complaint
over a channel that already works, while push is a multi-day project. But push
is what makes the fix feel native rather than like more email.

### 4.5 Preferences

Start coarse. A `NotificationPreference` row per `(user, organization)` with a
handful of booleans and a digest-time field beats a per-type matrix nobody will
configure. Org-level defaults set by owners, user-level overrides.

The one thing worth having on day one is a **mute/DND window**, so the T-12h
ladder cannot fire at 3am.

### 4.6 Scheduler shape

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

Reordered around the user feedback. The principle: **fix "I have to check" over
a channel that already works before building new channels.**

1. **`EventRoleSlot`** (§4.1). Blocks every staffing-state signal — no gap, no
   digest content, no `gap → 0`. Biggest single prerequisite; worth doing on its
   own merits. Revives `event-status-card.tsx` for free.
2. **`Organization.timeZone`** (§4.2) + settings UI. Blocks the digest. Small.
3. **`Notification` table** (§4.3). The dedupe ledger; needed before anything
   scheduled can run safely. No UI yet, no inbox — just the ledger.
4. **Ladder D: the daily admin digest.** The direct answer to the complaint,
   over email, which already works. Sends whether or not anything changed.
5. **Per-accept preference**, default off. One boolean; unblocks that user
   immediately and settles the argument with data rather than opinion.
6. **`gap → 0` milestone email.** Closes the loop early. One template, hooks
   into `acceptEventInvitation`, reuses `eventStaffingRecipients` unchanged.
7. **Ladder C: the T-3 escalation.** Small once the gap is computable.
8. **Ladder A** (invite-expiry reminders to volunteers). Directly reduces the
   lapse rate, which reduces the admin notices we already send.
9. **Push infrastructure** (§4.4) — device tokens, provider, lifecycle. Then
   mirror ladders A/D and the immediate layer onto it.
10. **Ladder B** (event reminders, condensed per person per day).
11. **Ladder C fuller preferences** (§4.5) and per-role digest granularity.
12. **SMS**, entitlement-gated, for T-24h and AT_RISK only.

Steps 1–4 are the smallest set that answers the feedback. Step 1 is the bulk of
the work and the one to scope first; 4–7 are each small once it lands.

---

## 6. Open questions — decide before step 3

- **Should `gap → 0` fire per role or per event?** Per event is calmer. Per role
  is more useful for a worship pastor who only cares that they have a drummer.
  `EventRoleSlot` makes both computable, so this can stay a preference.
- **What `needed` default does the `EventRoleSlot` backfill use?** `1` per
  existing role preserves today's exact semantics and is the safe migration.
  But it silently under-counts every event that has been wanting three BGVs all
  along, and those orgs will not notice until a digest tells them they are fully
  staffed when they are not. Worth a one-off prompt in the UI after migrating.
- **Does a smart-fill acceptance count as newsworthy?** The admin never invited
  that person — the system did. Argument for: they should know who is actually
  playing. Argument against: `AUTO_INVITE_SENT` already lands in the feed, and
  the point of auto-fill is that it handles it. Leaning: feed only, unless it
  completes the event (then it is a `gap → 0` anyway).
- **Is the org-wide activity feed a notification surface or an audit log?** It
  is currently an audit log. If the inbox in §4.3 is per-user, these stay
  separate and the feed keeps doing what it does. Worth confirming before
  building the bell, since merging them later is painful.
- **How does this interact with `autoAssigned`?** An auto-assigned volunteer
  never opted into that slot. Should their reminder ladder be more aggressive
  (they are less likely to be expecting it) or less (they did not ask for it)?
- **Is one user's "notify me more" the org's preference or his?** If per-accept
  becomes a per-admin toggle, two admins on the same event can disagree, which
  is fine. But an *org-level* default that an owner sets is probably the thing
  people actually want to configure, with per-admin overrides on top — same
  shape as §4.5.
- **Per-org volume ceiling?** Resend is 10 req/s per team, and
  `sendEmailBatches` already chunks for it — but that is a *platform-wide*
  budget being spent by individual orgs' crons. Worth modeling before ladders
  A–C multiply send volume.

---

## 7. Settle the default with data, not argument

The disagreement between "notify me on everything" and "that will drown people"
is an empirical question about org size, and the answer is already in the
database. Worth running before picking the §3.2 default — it is a handful of
queries, no new instrumentation.

- **Distribution of roster size per event.** `EventAssignment` grouped by
  `eventId`. If the median event has 4–6 assignments, per-accept email is
  ~5 messages per event and the volume objection is largely theoretical — his
  request is just correct, and the default should probably be *on* for small
  orgs. If there is a long tail at 15–20, the cap matters.
- **Admins per org.** `Membership` where `role != MEMBER`, grouped by org. This
  is the multiplier on everything in §3.1, and the number that decides whether
  role-broadcast is survivable.
- **Time-to-response.** `EventAssignment.createdAt` → `updatedAt` for
  `ACCEPTED`/`DECLINED` rows. Sets the reminder ladder honestly: if the median
  response is 8 hours, a T-48h reminder is noise; if it is 5 days, T-48h is too
  late to be the first nudge.
- **Lapse rate.** `EXPIRED` as a share of all assignments, per org. This is the
  number Ladder A is meant to move, and the baseline you need to know whether
  it worked.
- **Do declines cluster?** If most events see 0–1 declines, the immediate
  decline email is already low-volume and needs no bundling. If some events see
  five, the bucketing from the expiry cron should be lifted into the decline
  path too.

A reasonable default falls out of the first two alone: **per-accept email on by
default below some roster threshold, off above it**, with the toggle overriding
either way. That is defensible to both this user and the org that would have
been drowned.

## Sources

- [Planning Center: Bundled Scheduling & Notification Emails](https://www.planningcenter.com/blog/2018/06/bundled-email-and-notifications)
- [Planning Center: Set up reminder emails](https://help.planningcenter.com/en/142894-set-up-reminder-emails.html)
- [Planning Center: Send scheduling emails](https://help.planningcenter.com/en/142892-send-scheduling-emails.html)
- [Planning Center: Auto-reschedule declined volunteer requests](https://www.planningcenter.com/blog/2024/09/auto-reschedule-declined-volunteer-requests-in-services)
- [Linear Docs: Notifications](https://linear.app/docs/notifications)
- [Linear Docs: Inbox](https://linear.app/docs/inbox)
- [Calendly: Workflows & notifications](https://calendly.com/help/workflows-notifications)
- [Calendly: Guide to reminders](https://calendly.com/blog/guide-calendly-reminders)
