# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Conventions

Research the codebase before editing or suggesting. Never change code you haven't read. 
Trace relevant code.

## Project

NHC is an event planning and volunteer management platform for organizations (churches, nonprofits). Users create organizations, invite members with volunteer roles, plan events, and assign volunteers. Live at https://aeghin.com.

## Commands

```bash
npm run dev          # Dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npx prisma migrate dev --name <name>  # Create DB migration
npx prisma generate  # Regenerate Prisma client (also runs on postinstall)
npx prisma studio    # DB GUI
```

## Architecture

**Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui, Prisma 7 + Neon PostgreSQL, Clerk auth, Resend email.

### Route Groups

- `app/(auth)/` — Clerk sign-in/sign-up (public)
- `app/(routes)/` — Protected dashboard routes (organizations, events, invites)
- `app/(setup)/` — Onboarding for users with no memberships
- `app/api/webhooks/` — Clerk webhook syncing user data to the DB

### Data Layer (3-tier pattern)

1. **Validations** (`lib/validations/`) — Zod schemas for input validation, used with React Hook Form via `@hookform/resolvers`
2. **Services** (`lib/services/`) — Read operations with React 19 `"use cache"` directive, `cacheLife()`, and `cacheTag()` for data caching
3. **Actions** (`lib/actions/`) — `"use server"` mutations that write to DB and call `revalidatePath`/`revalidateTag` for cache busting

### Middleware (`proxy.ts`)

This is the Next.js middleware file (named `proxy.ts`, not `middleware.ts`). It:
- Protects `/dashboard`, `/api`, `/setup` routes via Clerk
- Skips auth for webhook routes
- Redirects authenticated users from `/` to `/dashboard`
- Redirects users with no memberships to `/setup`

### Key Patterns

- **Prisma singleton** in `lib/prisma.ts` uses `PrismaPg` adapter with Neon connection string
- **Generated types** live in `generated/prisma/` (enums: `OrgRole`, `VolunteerRole`, `InvitationStatus`)
- **Path alias**: `@/` maps to project root
- **Server actions** return `{ success: boolean, error?: string }` pattern
- **Email templates** in `components/email/` are React Email components sent via Resend
- **UI components** in `components/ui/` are shadcn/ui (don't modify these directly)
- **Component caching** is enabled in `next.config.ts` (`cacheComponents: true`)

### Database

PostgreSQL on Neon. Schema in `prisma/schema.prisma` with these core models:

- **User** ↔ **Membership** ↔ **Organization** (many-to-many via Membership with `OrgRole`)
- **Organization** → **Event** → **EventAssignment** (volunteer assigned to event with `VolunteerRole`)
- **Organization** → **Invitation** (email invite with token, expiry, and status)
- **Organization** → **ServiceType** → **Event** (color-coded event categories)
- **Event** → **EventDate** (multiple date/time blocks per event)

### Environment Variables

Required: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `RESEND_EMAIL_API_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`. Clerk URL vars configure sign-in/sign-up/redirect paths.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
