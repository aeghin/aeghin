# Notification & reminder strategy

Draft — decisions to make before writing code. Nothing here is implemented yet.

The question this answers: **who hears about what is happening to an event, how
often, and through which channel** — with NHC's `OWNER` / `ADMIN` / `MEMBER`
model and the email infrastructure already in `lib/email/`.

Revised twice against user feedback:

- *"Used to being notified, and not having to open the app to check."* Correct,
  and it broke the inbox-first model — see §2 and §3.4.
- *Notify at a threshold of **people invited**, not per response.* Also correct,
  and cheaper than the role-based reading this doc first gave it. §3.2 is built
  on that count now, and it needs no migration. `EventRoleSlot` (§4.2) went from
  "blocking" to "worth doing later."

The current recommendation is the three-layer contract in §3.2.

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

- **Round closed (`outstanding → 0`) and the digest** → the creator. They
  opened the loop; they should get it closed. Use `eventStaffingRecipients` rather than the raw column —
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
about.** If the only admin-facing signals are milestone transitions, there is
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

**On the count threshold ("email once 12 have accepted").** The denominator is
the **invite list**, not the roles. That makes it computable today with no
schema change at all, and it is a better signal than the role-based one.

The rows already exist. `EventAssignment` is unique on `[eventId, userId]`, so
its rows for an event *are* the people invited, and the five statuses split
cleanly into settled and not:

| Status | Still waiting on them? |
| --- | --- |
| `PENDING`, `expiresAt > now` | **Yes** — the only outstanding state |
| `ACCEPTED` / `DECLINED` | No — they answered |
| `EXPIRED` | No — they never answered and the window shut |
| `CANCELED` | No — an admin withdrew it (`lib/actions/event.ts:881`) |

```ts
const outstanding = await prisma.eventAssignment.count({
  where: { eventId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
});
```

One query, no migration, no `EventRoleSlot`.

**One refinement: make the trigger `outstanding === 0`, not "N accepted."**
Same idea, better specified, and strictly less work:

- **Nothing to configure.** "12" is right for one event and wrong for the next;
  "everyone I invited has answered" is right for all of them.
- **It is the actual open loop.** The admin is not waiting for a number, they
  are waiting to stop chasing people. Zero outstanding *is* that moment.
- **It is self-terminating.** Exactly one per invite round, ever — no cap or
  rate limit needed, because the trigger cannot repeat.

**The email is the bundle you were describing.** It reports the tally, which
rolls up every accept *and* every rejection into one message:

> **All 12 have responded** — 9 accepted, 2 declined, 1 never answered.
> *Sunday Service, Nov 30.*

When there are declines, that is also the "you may want to invite more" nudge,
arriving at the moment it is actionable rather than on a timer.

**Re-arm it per round.** If an admin invites four more people after everyone
answered, outstanding goes back above zero and then to zero again — and that
second landing is real news, not a duplicate. Fold the roster size into the
dedupe key so a new round re-arms it and a re-run does not:

```
responses-complete:event:<eventId>:<total assignment rows>
```

**Compute it in three places**, all of which already touch these rows:
`acceptEventInvitation`, `declineEventInvitation`, and the expiry sweep. The
sweep matters — "everyone has responded" can be reached by the last person
*never* answering, and only the cron knows that.

**What this does not tell you.** It measures *response completion*, not
*staffing adequacy*. Invite 5 people to an event that needs 12 and it will
cheerfully report that everyone responded. The system does not know true need —
that is the `EventRoleSlot` gap in §4.2, which is a real limitation but **not a
blocker for any of this**, and worth deferring.

**Skip intermediate thresholds.** "8 of 12 have answered" is not actionable —
nothing changes in the admin's behaviour between 8 and 11 — and each extra
threshold competes with the emails that matter.

**Recommended shape.** `outstanding === 0` is strong enough to change the
earlier recommendation. The daily digest was proposed to solve the silence
problem — the admin not knowing whether anything is happening. But a digest
solves it with a *heartbeat*, and there is a cheaper way: give the admin a
**contract** instead.

> You will hear when everyone has answered. You will hear at T-3 if they
> haven't. You will hear immediately if someone declines.

An admin who believes that contract has no reason to open the app to check, and
it costs **two or three emails per event** rather than one per day. That is the
lower-volume instinct behind the original question, and it is the right one.

| Layer | Fires | Volume |
| --- | --- | --- |
| **Immediate** | A decline, or a lapse | Per occurrence — actionable now; mostly built |
| **Round closed** | `outstanding → 0` | Once per invite round |
| **Escalation** | T-3d with `outstanding > 0` | At most once per event |

Response state is derived entirely from rows that already exist — no new
columns, no `rolesNeeded` arithmetic:

```
OPEN    → outstanding > 0        still chasing people
CLOSED  → outstanding === 0      everyone answered or lapsed
```

**Demote the daily digest to opt-in.** It is still right for someone who wants a
morning glance at everything, and the machinery is shared — but as a *default*
it sends far more mail than the contract does, for the same certainty. Ship the
contract; offer the digest.

**One gap the contract leaves.** An event invited three weeks out, with everyone
slow to answer, produces a long silence between "invites sent" and "everyone
answered," with T-3 the only backstop. If that proves uncomfortable in practice,
the cheapest fix is **one** nudge at the midpoint — not a daily cadence. Wait
for someone to complain before building it.

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
| T-3d | `outstanding > 0` | Creator **and** all admins/owners (tier 3) |

One escalation, not a ladder of them. T-3d matches the instinct behind
"3–5 days before"; T-5 is also defensible and the right pick depends on the
time-to-response data in §7 — set it as a constant, not a guess baked into
logic.

There is no T-7 rung: the round-closed signal already fires the moment the
chasing is over, so a rung before T-3 would mostly fire on events that are
about to close themselves out. **The escalation's value is the widened audience and the changed
subject line:** an event three days out with holes in it has stopped being one admin's
problem and become the organization's.

**The window should depend on `smartSchedulingEnabled`.** This is the biggest
single refinement in the cadence section, and it is what makes the escalation
actually useful to the orgs that need it most.

| | On decline | What the admin must do | Escalate at |
| --- | --- | --- | --- |
| **Smart scheduling ON** | `findBestReplacement` auto-invites the next eligible member | Nothing, usually | **T-3d** — a backstop for when auto-fill finds nobody |
| **Smart scheduling OFF** | `notifyShortage("Auto-fill is off…")`, and the slot just sits there | Notice → pick someone → invite → **wait for them to answer** | **T-7d** |

The asymmetry is that last column. With smart scheduling off, closing a gap
requires a *whole second invitation round*, and the new invitation needs as long
to be answered as the first one did. If the median response takes two days (§7
measures this), an escalation at T-3 leaves no room for the replacement to
reply — the admin is told about a problem they can no longer fix in time.

Same code, different constant:

```ts
const ESCALATE_DAYS = event.smartSchedulingEnabled ? 3 : 7;
```

This is also the honest answer to *"being notified is the biggest win for
someone not using smart scheduling."* It is — but only if the notice arrives
with enough runway to act on. A perfectly worded email at T-1 is the same
outcome as no email at all.

Condition it on **`outstanding > 0`** — people who have not answered — which is
the same count the round-closed signal watches. Declines are *not* a condition
here: a decline already sent its own immediate email, and re-raising it at T-3
is the duplicate that teaches people to ignore the channel. What T-3 adds is
the people who have gone quiet, which nothing else catches.

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
| **In-app inbox** | Absent | *Not* a channel. A read model + dedupe ledger (§4.4) |
| **SMS** | `twilio` installed, commented out at `lib/actions/invitation.ts:26,125`; `User.phoneNumber` already synced from Clerk (`app/api/webhooks/route.ts:34`) | Terminal escalation only — T-24h, AT_RISK |

Three rules:

- **Never gate an outbound send on in-app read state.** That was the Linear rule
  and it does not apply here (§2). Send on the schedule; let the app be where
  you act, not a condition on being told.
- **Push and email carry the same signal, deduped per person per signal.** Push
  is the tap on the shoulder, email is the detail. The `Notification.dedupeKey`
  in §4.4 is what keeps them from double-firing.
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
| Accepts | Not sent individually; rolled into the round-closed tally |
| Progress | The digest, daily — opt-in only |
| `outstanding → 0` | Immediate, once per round — and it *is* the bundle: one tally covering every accept and decline |
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

## 4. Schema and infrastructure gaps

§4.4 is the only hard prerequisite for §3.2 — everything the round-closed signal
counts already exists in `EventAssignment`. The rest are ordered by what they
block: a clock (§4.3), a channel (§4.5), or nothing at all (§4.2).

### 4.1 Invite expiry is not clamped to the event date — bug, and the direct cause

This is the mechanism behind "they check a day before and see open slots or
expired spots." An invitation's deadline is computed purely from *now*, with no
reference to when the event actually happens. Four write sites, none of which
read the event's dates:

| Site | Window |
| --- | --- |
| `lib/actions/event.ts:354` — `createEvent` | 3 / 5 / 7 days from now |
| `lib/actions/event.ts:1559`, `:1572` — `inviteMembersToEvent` | 3 / 5 / 7 days from now |
| `lib/actions/event.ts:1019` — `resendEventInvitation` | `RESEND_EXPIRY_DAYS = 3` |
| `lib/actions/event.ts:715` — smart-fill replacement | 7-day fallback |

```ts
expiresAt: new Date(Date.now() + expiresAt * 24 * 60 * 60 * 1000)
```

**So an invitation can outlive the event it is for.** Invite someone two days
before a service with a 7-day window and the invite expires five days *after*
the service. That row:

- never flips to `EXPIRED` before the event, so the hourly sweep never selects
  it and `notifyLapsedAssignments` **never fires for it**;
- renders as amber "Pending" on the roster right through the event and past it;
- is precisely the unresolved slot an admin discovers the day before.

No notification design fixes this, because there is no event to notify *on*. The
signal the admin needs — "this person is not coming" — is never generated.

**Fix:**

```ts
const window = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const cutoff = new Date(eventStart.getTime() - GRACE_MS); // e.g. 24h before
expiresAt = window < cutoff ? window : cutoff;
```

A one-line clamp at four sites. It guarantees every invitation resolves —
answered or lapsed — while there is still time to do something, which is what
makes the lapse notification worth sending at all. **Do this first.** It is the
cheapest item in this document and the highest-leverage.

Watch the degenerate case: an event created for *tomorrow* leaves a window of
hours, not days. That is correct behaviour (a deadline after the event is
meaningless), but the create form should say so rather than silently shrinking
the admin's 7-day choice to six hours.

### 4.2 Events cannot express how many people a role needs — *not* blocking

**Not a prerequisite for anything in §3.2** — the response-completion model
counts invitations, which the schema already supports. Recorded here because it
is a real gap that bounds what the notifications can *claim*, and because an
earlier draft of this doc wrongly treated it as the blocker.

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

- **"Is this event actually staffed?" is not answerable.** The strongest
  available test is the one the expiry cron already makes — every distinct role
  has at least one `ACCEPTED` assignment (`app/api/cron/expire-invitations/route.ts`,
  the `filled` set). An event wanting three BGVs reads as staffed the moment one
  accepts.
- **Which is why §3.2 reports response completion instead.** "All 12 answered,
  9 accepted" is a claim the schema can actually support. "You are fully
  staffed" is not, today — and saying it wrongly is worse than not saying it.

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

  unique([eventId, role])
  index([eventId])
}
```

Then `Σ needed − count(ACCEPTED)` is a real shortfall, per event and per role.
That unlocks a genuine "fully staffed" signal, a shortfall figure in the T-3
escalation, and the dormant status card. `EventTemplate.rolesNeeded` needs the
same treatment so recurring services carry their counts.

Migration is the real cost: backfill one `EventRoleSlot{ needed: 1 }` per entry
in each event's existing `rolesNeeded`, which preserves today's exact semantics,
then move the ~10 read sites (`lib/actions/event.ts:233, 1234, 1314, 1343,
1445, 1580`, `components/dashboard/events/event-assignment-section.tsx:119`) over.
Not hard, but it is a day of careful work — which is exactly why it should not
gate the notification work. Ship §3.2 against the invite count first.

Worth doing on its own merits, though: "we need 3 BGVs" is a real scheduling
need the product cannot express, and `event-status-card.tsx` suggests it has
been missed once already.

### 4.3 Organizations need a real timezone — blocking

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

### 4.4 Reminders need a dedupe key — blocking

The existing cron gets deduplication **for free** from the `PENDING → EXPIRED`
transition: a flipped row can never be selected again, so nobody is mailed
twice. That is why it is safe as a bare hourly sweep with no extra state.

**Reminders have no such transition.** Sending a T-48h reminder mutates nothing,
so the next hourly tick sends it again. And again. This is the single biggest
engineering risk in the whole plan.

Recommended: a notification log where a unique constraint does the work —
mirroring how `unique([eventId, userId])` already guards assignments.

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

  index([userId, organizationId, readAt])
  index([eventId])
}
```

This one table does triple duty: dedupe key, in-app inbox read model, and the
read-state signal that decides whether email escalates. Build it once.

### 4.5 Push notifications — the largest single piece of missing work

Nothing in the schema or the API supports push. This is net-new:

- A `DeviceToken` model (`userId`, `token`, `platform`, `lastSeenAt`), with
  registration and revocation routes under `app/api/mobile/v1/`.
- A provider. Expo's push service is the least work if the RN client is an Expo
  app; APNs + FCM directly if it is bare RN. **Check which before estimating —
  it is the difference between a day and a week.**
- Token lifecycle: tokens rotate and go stale, and dead tokens must be reaped on
  provider rejection or the send queue silently rots.
- A `pushedAt` column alongside `emailedAt` on `Notification` (§4.4), so the two
  channels dedupe against one shared ledger.

Sequenced after the digest in §5 because the digest fixes the stated complaint
over a channel that already works, while push is a multi-day project. But push
is what makes the fix feel native rather than like more email.

### 4.6 Preferences

Start coarse. A `NotificationPreference` row per `(user, organization)` with a
handful of booleans and a digest-time field beats a per-type matrix nobody will
configure. Org-level defaults set by owners, user-level overrides.

The one thing worth having on day one is a **mute/DND window**, so the T-12h
ladder cannot fire at 3am.

### 4.7 Scheduler shape — cron for everything, with one exception

**Recommendation: compute notifications in a cron, not inline in the actions.**

The decisive argument is not preference, it is that **the cron path is required
whether you want it or not.** A round can close because the last outstanding
invitation *expired* — nobody clicked anything, no server action ran, and only
the hourly sweep knows it happened. The same is true of every T-minus signal:
"three days out and two people are quiet" is a fact about the passage of time,
not about anything a user did.

So a cron has to exist regardless. Given that, an inline path in
`acceptEventInvitation` / `declineEventInvitation` buys **at most one cron
interval of latency** and costs a second implementation of the same logic that
must agree with the first. That is a bad trade for a signal nobody is standing
by for.

The principle worth writing down:

> **Notify from state, not from actions — unless a person is waiting on the
> answer.**

Which gives a clean split:

| Shape | Examples | Where |
| --- | --- | --- |
| **Someone just did something, and another person needs to know now** | Decline → shortage email; removed from event; event canceled or updated | **Inline**, via `after()` — already built, leave it |
| **Something is now true of the world** | Round closed; T-3 quiet; invite expiring in 48h; digest | **Cron** — recompute from rows, no event to miss |

Three properties that fall out of the cron shape and are worth naming, because
they are the reason it is the right default:

- **Idempotent by construction.** It recomputes state rather than reacting to an
  edge, so a missed tick, a redeploy mid-run, or a duplicate invocation changes
  nothing. An inline trigger that fails is lost permanently and silently.
- **Naturally batched.** One run sees every event at once, so bundling across
  events for a single recipient is free (§3.5) rather than requiring a queue.
- **Testable without a request.** You can run the sweep against a seeded
  database and assert on what it would send.

The ledger (§4.4) is what makes it safe to add an inline fast path *later*, as a
pure latency optimization, without risking a double-send — the `dedupeKey`
unique constraint resolves the race whichever path gets there first. Don't build
that until someone asks for it.

**Concretely:**

- Keep `expire-invitations` hourly and untouched.
- Add `/api/cron/notifications` at **every 15 minutes** — precise enough for
  every window in §3.3, and cheap.
- Reuse the sweep discipline verbatim: `CRON_SECRET` + `timingSafeEqual`, a
  `SWEEP_LIMIT` cap, a `NOTIFY_WINDOW` backlog guard, and — critically — the
  **re-check-at-send-time** pattern from `notifyLapsedAssignments`. Anything
  queued at T-48h must re-verify the invitation is still outstanding at the
  moment it sends.

One ordering note: the round-closed check must run **after** the expiry sweep
within a tick, or an expiry that closes a round is seen a tick late. Either
fold it into `expire-invitations` or have the notifications cron read the
sweep's own output.

---

## 5. Suggested order of work

Reordered around the user feedback. Two principles: **fix the reason the signal
never fires before designing the signal**, and **use the channel that already
works before building new ones.**

1. **Clamp invite expiry to the event date** (§4.1). A bug fix, roughly an
   hour, and nothing downstream is worth much without it: an invitation that
   outlives its event never lapses, never notifies, and is exactly the
   unresolved slot found the day before.
2. **`Notification` table** (§4.4). The dedupe ledger. Nothing scheduled or
   once-only can run safely without it, and `responses-complete:...` is the
   first key it carries. No UI, no inbox — just the ledger.
3. **Round-closed email** — `outstanding → 0`, with the tally. Pure application
   logic over rows that already exist; hooks into `acceptEventInvitation`,
   `declineEventInvitation`, and the expiry sweep. **This is the one that
   answers the original question**, and it needs no migration.
4. **Per-accept preference**, default off. One boolean; unblocks the user who
   asked and settles the default with data rather than opinion (§7).
5. **Ladder C: the staffing escalation** (T-3 with smart scheduling, T-7
   without). Same count as step 3, plus a date filter and a widened recipient
   list. Small.
6. **`Organization.timeZone`** (§4.3) + settings UI. Needed before anything
   fires on a clock rather than on an event.
7. **Ladder A** (nudge the volunteer before their invitation lapses). Worth
   pulling forward for orgs without smart scheduling: it prevents the gap
   instead of reporting it, and a lapse that never happens needs no admin
   intervention at all. Reduces how often steps 3 and 5 carry bad news.
8. **The digest**, opt-in (Ladder D).
9. **Push infrastructure** (§4.5) — device tokens, provider, lifecycle. Then
   mirror the three layers onto it.
10. **Ladder B** (event reminders, condensed per person per day).
11. **`EventRoleSlot`** (§4.2) — upgrades "everyone answered" to "you are
    actually staffed", and revives `event-status-card.tsx`.
12. **Fuller preferences** (§4.6).
13. **SMS**, entitlement-gated, for T-24h and the staffing escalation only.

**Steps 1–3 are the whole answer to the original question** and involve no
schema change beyond the ledger. Everything past step 5 is expansion.

---

## 6. Open questions — the first two decide step 2's copy

- **Does the round-closed email fire when *nobody* accepted?** `outstanding → 0`
  with twelve declines is technically "everyone answered" and is really an
  emergency. Same trigger, very different subject line — worth branching the
  copy rather than the trigger.
- **Does withdrawing an invite close a round?** Cancelling the last outstanding
  invite drives `outstanding` to zero with nobody having answered. It probably
  should not mail — the admin just did it and knows. Guard on whether the last
  transition was actually a response.
- **What `needed` default does the `EventRoleSlot` backfill use?** `1` per
  existing role preserves today's exact semantics and is the safe migration.
  But it silently under-counts every event that has been wanting three BGVs all
  along, and those orgs will not notice until a digest tells them they are fully
  staffed when they are not. Worth a one-off prompt in the UI after migrating.
- **Does a smart-fill acceptance count as newsworthy?** The admin never invited
  that person — the system did. Argument for: they should know who is actually
  playing. Argument against: `AUTO_INVITE_SENT` already lands in the feed, and
  the point of auto-fill is that it handles it. Leaning: feed only, unless it
  closes the round (then it is a round-closed email anyway).
- **Is the org-wide activity feed a notification surface or an audit log?** It
  is currently an audit log. If the inbox in §4.4 is per-user, these stay
  separate and the feed keeps doing what it does. Worth confirming before
  building the bell, since merging them later is painful.
- **How does this interact with `autoAssigned`?** An auto-assigned volunteer
  never opted into that slot. Should their reminder ladder be more aggressive
  (they are less likely to be expecting it) or less (they did not ask for it)?
- **Is one user's "notify me more" the org's preference or his?** If per-accept
  becomes a per-admin toggle, two admins on the same event can disagree, which
  is fine. But an *org-level* default that an owner sets is probably the thing
  people actually want to configure, with per-admin overrides on top — same
  shape as §4.6.
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
