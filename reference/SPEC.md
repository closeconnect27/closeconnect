# Close.Connect — Full Webapp Build Spec (for Claude Code)

**How to use this doc:** Work through it phase by phase with Claude Code (Section 10). Don't paste the whole thing at once — scaffold first, verify it runs, then move forward one phase at a time. Attach the six mockup files (`landing.html`, `communities.html`, `events.html`, `profile.html`, `search.html`, `map.html`) plus the two reference implementation files (Section 4) at the start of your Claude Code session.

---

## 1. What this app actually is

Close.Connect is a Bengaluru community + events platform with two kinds of communities:

- **Native communities** — live inside the app, structured like WhatsApp Communities: one umbrella community containing multiple sub-groups, each with its own chat. Members request to join (with an owner-defined form) or join freely, depending on how the owner configures it. Members can rate the community.
- **External communities** — same as today: a directory listing that links out to an existing WhatsApp/Instagram group.

**Events do not require a community.** An event always has a **host** (a user profile) and *optionally* belongs to a community. A solo organizer with no community can host events directly under their own profile — the community link is context, not a requirement.

**Three separate login-gated actions, kept distinct on purpose:**
1. **Hosting** — creating/managing communities and events. Requires an account.
2. **Joining a native community** — requires an account (ongoing chat identity).
3. **Registering for an event** — stays guest-friendly, no account required, exactly like today. Don't add friction here that doesn't already exist.

---

## 2. Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) | Best-documented framework for AI-assisted dev; official Supabase SSR helpers; fixes the session/auth flakiness structurally rather than patching around it |
| Styling | Tailwind CSS | Matches the utility-first approach in your mockups; fast for an AI agent to iterate on |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) | Proven out over this whole project already |
| Realtime chat | Supabase Realtime | No separate chat service; free tier handles 200 concurrent connections |
| Email | Resend (already connected) | Keep as-is |
| Payments | Razorpay Payment Links (Phase 1), Orders + webhook (later phase) | Matches what's already working |
| Hosting | Cloudflare Pages | See Section 12 — Vercel's free tier bans commercial use (payments included), Cloudflare's doesn't, and you already have the account + domain there |

---

## 3. Design system (from your mockups — treat as source of truth)

```
--bg: #0a0a0a       --green: #5DCAA5 (primary accent)
--bg2: #141414      --green-dark: #0d2218
--bg3: #1a1a1a      --green-mid: #1D9E75
--border: #222      --pink: #D4537E (ratings, alerts)
--border2: #2a2a2a  --purple: #7F77DD (tertiary — profile)
--text: #f0f0f0     --radius: 14px
--text2: #888       --radius-sm: 10px
--text3: #444

Fonts: 'Syne' (700/800) for headings, 'DM Sans' (400/500) for body
Icons: Tabler Icons
```

The phone-frame chrome in the mockups (status bar, notch, device border) is a preview convention only — build responsive real pages, not a literal phone frame. Extract shared components (cards, buttons, star rating, nav bar, modals) into `/components/ui/` before building pages.

---

## 4. Reference implementation — attach these two files to Claude Code

Attach `reference_current_index.html` and `reference_current_events.html` — the actual current production code, live today. Tell Claude Code: "These are the current production implementation. Port the proven logic — don't redesign the underlying approach unless this spec calls for a change."

**Worth preserving from `reference_current_index.html`:** the claim workflow (`submit_claim` RPC, `sync_claim_status` trigger — extend this exact pattern to native community ownership); the Edit Community flow's defensive `.update().select()` pattern that catches RLS silently blocking a write; the category visual/image system (`CAT_VISUALS`, seeded image picker); the WhatsApp/Instagram link validator (`isValidWaLink`, `safeJoinHref`).

**Worth preserving from `reference_current_events.html`:** the drag-to-select date range calendar (`drMouseDown`/`drMouseEnter`/`drMouseUpGlobal`) — took several iterations to get right, port the interaction model as-is; the dynamic form builder, and the specific bug already found and fixed: re-rendering the field list on every keystroke destroys input focus — tell Claude Code explicitly not to reproduce this when building the React version; the CSV export logic; the owner-gated dropdown permission pattern (`loadHostableCommunities`).

Also tell Claude Code: several other bugs were found and fixed iteratively (RLS policies silently missing after edits, browser autofill polluting form fields, invalid/broken image IDs). Ask it to actively check whether the new implementation could reintroduce any of these same categories of bug, not just copy code as-is.

---

## 5. Data model

A key design decision here: one unified, reusable form-builder system powers three different features — event registration, ticket-type custom questions, and community join-requests — rather than three separate implementations of "a form with custom fields." This is what makes the app cohesive instead of three disconnected features that happen to look similar.

```sql
-- CORE IDENTITY

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text,
  interests text[],
  host_rating numeric(2,1) default 0,      -- avg rating as an event host (optional, phase 2)
  created_at timestamptz default now()
);

-- COMMUNITIES (native + external)

create table communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  category text not null,
  extra_categories text[] default '{}',   -- multi-category support, see Section 6
  city text,
  community_type text not null default 'both' check (community_type in ('online','offline','both')),
  kind text not null check (kind in ('native','external')),
  external_link text,                      -- required if kind = 'external'
  join_mode text default 'open' check (join_mode in ('open','request')),  -- WhatsApp-style: open join vs admin-approved
  cover_image_url text,
  owner_id uuid references profiles(id) not null,
  claim_status text default 'unclaimed' check (claim_status in ('unclaimed','pending','approved','rejected')),
  avg_rating numeric(2,1) default 0,
  rating_count int default 0,
  member_count int default 0,
  status text default 'active' check (status in ('active','hidden','reported')),
  created_at timestamptz default now()
);

-- Sub-groups within a native community (WhatsApp Communities model: one umbrella, many topic groups)
create table community_groups (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  name text not null,
  description text,
  is_announcement boolean default false,   -- true = admin-only broadcast channel, auto-created per community
  is_default boolean default false,        -- auto-joined when someone joins the community
  created_at timestamptz default now()
);

-- Community-level membership (join the umbrella community)
create table community_members (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member' check (role in ('owner','moderator','member')),
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);

-- Sub-group-level membership (members choose which groups to join, like WhatsApp)
create table community_group_members (
  group_id uuid references community_groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- Chat, scoped to a specific sub-group (not the whole community)
create table community_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references community_groups(id) on delete cascade not null,
  user_id uuid references profiles(id) not null,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz default now()
);

create table community_ratings (
  community_id uuid references communities(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  review text,
  created_at timestamptz default now(),
  primary key (community_id, user_id)
);

-- EVENTS (host-first, community optional)

create table events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references profiles(id) not null,           -- always required
  community_id uuid references communities(id),             -- nullable: events don't need a community
  event_name text not null,
  description text,
  event_date date not null,
  event_time time,
  venue text,
  city text,
  category text,
  cover_image_url text,
  status text default 'active' check (status in ('active','cancelled')),
  created_at timestamptz default now()
);

-- Ticket types per event (inspired by AllEvents: free + paid + early-bird tiers)
create table event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  name text not null,                      -- e.g. "General", "Early Bird", "VIP"
  price numeric(10,2) default 0,           -- 0 = free
  payment_link text,                       -- Razorpay link for this specific tier
  quantity_available int,                  -- null = unlimited
  sort_order int default 0
);

-- UNIFIED FORM SYSTEM (used by BOTH event registration AND community join-requests)

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('event','community')),
  owner_id uuid not null,                  -- points to events.id or communities.id depending on owner_type
  label text not null,
  field_type text not null check (field_type in ('text','textarea','email','phone','number','select')),
  options text[],
  is_required boolean default true,
  sort_order int default 0
);

create table form_responses (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('event','community')),
  owner_id uuid not null,
  ticket_type_id uuid references event_ticket_types(id),   -- only relevant when owner_type = 'event'
  respondent_id uuid references profiles(id),               -- nullable: guest event registration allowed
  response_data jsonb not null,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  -- event registrations default to 'approved' (guest-friendly, instant);
  -- community join-requests default to 'pending' when join_mode = 'request', or auto-'approved' when join_mode = 'open'
  checked_in_at timestamptz,               -- event check-in (QR scan), null for community join-requests
  created_at timestamptz default now()
);

-- When a community form_response (join request) flips to 'approved', a trigger inserts into community_members.
-- This is one function, reused for both open-join auto-approval and manual admin approval — see Section 7.

-- MODERATION

create table reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('community','event','message','user')),
  target_id uuid not null,
  reporter_id uuid references profiles(id),
  reason text not null,
  status text default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);
```

**RLS — deny-by-default on every table:**

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| profiles | public | own row, on signup | own row only | never |
| communities | public (active) | authenticated | owner/admin | admin |
| community_groups | public | owner/moderator | owner/moderator | owner/moderator |
| community_members | public | self (open join) or via approved form_response trigger | self (leave) | self or owner |
| community_group_members | members of parent community | self, if member of parent community | never | self or moderator |
| community_messages | members of that specific group | members of that group, own user_id | never (no edits) | own message or moderator |
| community_ratings | public | authenticated, once per community | own rating | own rating |
| events | public (active) | host or community owner/moderator | host or admin | host or admin |
| event_ticket_types | public | event host | event host | event host |
| form_fields | public | owner of the event/community | owner | owner |
| form_responses | owner of event/community (never public — PII); own responses visible to the respondent | public for events (guest-friendly); authenticated for community join-requests | owner only (to approve/reject); check-in field updatable by host | admin only |
| reports | admin only | any authenticated user | admin | admin |

---

## 6. Multi-category display (your requirement)

A community with `category = 'sports'` and `extra_categories = ['social','fitness']` must appear when browsing any of those three categories, not just the primary one.

Query pattern (Supabase JS):
```js
// Browsing category X — matches primary OR extra categories
const { data } = await supabase
  .from('communities')
  .select('*')
  .or(`category.eq.${categorySlug},extra_categories.cs.{${categorySlug}}`)
```

Tell Claude Code: build this as a shared query helper (`getCommunitiesByCategory(slug)`) used everywhere a category filter appears — search, browse grid, sidebar counts — so the multi-category logic lives in exactly one place, not reimplemented per page.

---

## 7. Native community structure — how the request-to-join + sub-groups actually work

This mirrors WhatsApp Communities specifically (researched current behavior, mid-2026):

- A community has one umbrella entity and multiple sub-groups, each with independent chat.
- Every community auto-creates a default "General" group on creation, plus optionally an announcement group (owner/moderator-only posting, broadcast to all members) if the owner enables it.
- `join_mode` on the community controls the join flow:
  - `open` — anyone clicks Join, a `community_members` row and default-group membership are created immediately.
  - `request` — clicking Join opens a form built from `form_fields` where `owner_type = 'community'` (the owner defines these questions when creating the community, e.g. "Why do you want to join?", "How did you hear about us?"). Submitting creates a `form_responses` row with `status = 'pending'`. The owner sees pending requests in their host dashboard and approves/rejects. Approval is what triggers the `community_members` insert — write this as a single Postgres trigger function (`approve_join_request()`) so both the open-join auto-approval and the manual admin approval path end up calling the same code, not two different insert statements that can drift out of sync.
- Once a member of the community, a member can browse and join specific sub-groups (`community_groups`) individually — mirroring how WhatsApp lets you be a community member without being in every sub-group.
- Chat (`community_messages`) is scoped to a group, not the whole community — this matches the real WhatsApp Communities structure (chat happens in groups; the community level is just the announcement/organizing layer).

---

## 8. Event registration & ticketing — features worth building in from AllEvents/SortMyEvent research

Researched what mature event platforms actually offer so Close.Connect doesn't ship a thinner version by accident:

- Multiple ticket types per event (`event_ticket_types`) — free + paid + early-bird, each with its own Razorpay Payment Link and optional quantity cap. This replaces the single "one payment link per event" model from the current site with something that actually matches how real events price tickets.
- Custom form per event (reusing the unified `form_fields`/`form_responses` system) — same as today, but now also supports a form per ticket type if you want different questions for, say, VIP vs General (optional refinement, not required for launch).
- QR check-in: `form_responses.checked_in_at` — host can mark someone checked in at the door. Build a simple host-facing page that looks up a registrant (by search or by scanning a QR code containing the `form_responses.id`) and sets this timestamp. Don't over-build this into a full native scanning app for v1 — a mobile web page with a JS QR-reading library is enough.
- Shareable event link (already proven in the current site via `?event=<id>` — becomes a proper dynamic route `/events/[id]` in Next.js, a strict improvement).
- Host/organizer public profile: `profiles.host_rating` plus a page showing all of someone's past/upcoming hosted events — matches AllEvents' "organizer page with follower count" pattern, giving repeat hosts social proof.
- What NOT to build yet (explicitly deferred, don't let scope creep in here): seat maps, coupon codes, email drip campaigns, waitlists for sold-out events, Apple/Google Wallet integration. These are real AllEvents features but are meaningfully more work for value you don't need until you have real ticket-selling volume. Revisit after the app is live and being used.

---

## 9. Page-by-page functional spec

`landing.html` -> `/` — Public marketing/hero page.

`search.html` -> `/search` — Unified search across communities + events, public.

`communities.html` -> `/communities` — Browse/filter (category — using the multi-category query from Section 6 — city, native vs external). Cards show avg rating + member count (native) or "external" badge.

`communities/[id]` — For native: sub-group list (join individual groups), chat feed for joined groups, member list, rating widget, Join/Request-to-Join button depending on `join_mode`. For external: today's detail card (join link, report).

`events.html` -> `/events` — Browse/filter (category, city, community optional filter, host, date range — port the drag-select calendar). Cards show host name + community name if any.

`events/[id]` — Ticket type selector (if multiple), custom form per `form_fields`, payment link per ticket type, shareable link, host-only registrant list + check-in + CSV export.

`profile.html` -> `/profile` — Own profile: joined communities, hosted events, ratings given, edit bio/avatar.

`host/dashboard` (new, not in mockups) — Manage owned communities (including pending join-requests to approve) and events (including registrant/check-in management) in one place.

`map.html` -> explicitly deferred. Stub route only.

---

## 10. Phase plan

1. Scaffold: Next.js + TypeScript + Tailwind + Supabase client (`@supabase/ssr`). Deploy empty shell to Cloudflare Pages first — prove the pipeline before writing features.
2. Schema + RLS: all tables above, RLS test suite (log in as User A, confirm you cannot read/write User B's data — actually test it, don't just write the policy and assume).
3. Auth: magic link via Resend, profile auto-creation trigger on signup, protected routes.
4. Communities (read + external join): browse with multi-category matching, detail page, external join flow ported from current site.
5. Native communities: create community (with join_mode choice + join-request form builder), sub-groups, join flow (both open and request paths through the single approval trigger), Realtime chat scoped per group, rate-limiting on messages.
6. Ratings: rate modal, average recalculation trigger, display on cards.
7. Events: browse/filter (port the calendar), event detail, ticket types, unified form builder reused from Phase 5, guest registration, CSV export, check-in.
8. Payments: Razorpay Payment Link per ticket type.
9. Host dashboard: unify community management (pending requests) + event management (registrants, check-in) in one place.
10. Security & QA pass: full checklist below, fix everything found.
11. Deploy: production Supabase project, env vars, custom domain, live keys, full smoke test.

---

## 11. Security & vulnerability checklist

- RLS tested by actually attempting cross-user access, not just policy-exists checks.
- No secret keys (service role, Razorpay secret, Resend key) in client code or NEXT_PUBLIC_* vars.
- All input validated server-side with Zod, never trusting client-side checks alone.
- User-generated content (chat, bios, descriptions) always escaped, never dangerouslySetInnerHTML.
- Rate limiting on: chat messages, community/event creation, ratings, join-requests, registrations.
- File uploads (avatars, covers) validated for type + size (under 3MB, image MIME types) client and server side.
- Razorpay webhook (when built) validates signature — never trust unsigned payloads.
- npm audit clean of high/critical issues before deploy.
- No sensitive data in console.log in production code.
- Server Actions used correctly for CSRF protection; manual fetch calls to API routes have equivalent protection.
- CORS on custom API routes restricted to your own domain.
- The trigger-based join-approval function (Section 7) tested for the specific edge case of double-submission (someone spamming the join button) not creating duplicate memberships.

---

## 12. Deployment checklist

1. Push to a private GitHub repo.
2. Cloudflare Pages -> connect repo -> configure `@cloudflare/next-on-pages` build.
3. Create a separate production Supabase project, run all migrations there.
4. Set env vars in Cloudflare Pages: Supabase URL/anon key (public), service role key (server-only), Resend key, Razorpay key + secret.
5. Point closeconnect.in at the new Pages project.
6. Update Supabase Auth -> URL Configuration with the production domain.
7. Full smoke test: sign up -> create native community with request-to-join -> have a second test account request to join -> approve it -> chat in a sub-group -> rate the community -> host an event with no community attached -> register as guest -> pay a test ticket -> check in the registrant.
8. UptimeRobot free monitoring.

Vercel ToS note (carried over — still applies): Vercel's Hobby plan bans commercial use, explicitly naming payment processing as disqualifying. Cloudflare Pages has no such restriction, which is why it's the default recommendation here.

---

## 13. Cost breakdown (10 communities, ~100 events scale)

| Service | Plan | Cost |
|---|---|---|
| Cloudflare Pages | Free | Rs 0 |
| Supabase | Free -> Pro if needed | Rs 0 -> ~Rs 2,100/mo ($25) |
| Resend | Free | Rs 0 (3,000 emails/mo, 100/day) |
| Domain | Owned | ~Rs 75-150/mo amortized |
| Razorpay | Usage-based | ~2% + GST per transaction only |
| Uptime monitoring | Free | Rs 0 |
| Total to start | | ~Rs 75-150/month |
| Total once Supabase Pro is needed | | ~Rs 2,200-2,300/month |

Free tier capacity at this scale (Supabase, verified mid-2026 limits): 500MB database, 1GB file storage, 5GB bandwidth/month, 50,000 MAUs, 200 concurrent Realtime connections, 2M Realtime messages/month, auto-pause after 7 days idle.

- Database size: not a constraint at 10 communities/100 events — even generous chat volume stays well under 500MB for a long time.
- Realtime connections (200 concurrent): the one to actually watch. With sub-groups now splitting chat traffic across smaller rooms rather than one big community-wide feed, concurrent connections per room are naturally lower — this design choice helps you stay under the ceiling longer, not just organizationally cleaner.
- Bandwidth (5GB/month): the limit most small apps hit first in practice. Compress cover images (under 200KB), paginate chat and registrant lists.
- 7-day pause: matters most before consistent daily usage — a quiet week during testing means the next visitor hits an error until manually resumed.

Recommendation unchanged: start free, watch usage weekly, upgrade to Pro the moment you approach any ceiling — don't pre-pay for headroom you don't need yet.

---

## 14. What to literally tell Claude Code first

I'm building Close.Connect, a community + events platform. Attached: six HTML mockups (landing, communities, events, profile, search, map) defining the visual design system, plus reference_current_index.html and reference_current_events.html, the actual current production code with proven working logic (claim workflow, drag-select date calendar, dynamic form builder, RLS patterns) to port rather than rebuild from scratch. Build this as Next.js 14 App Router + TypeScript + Tailwind + Supabase, deployed to Cloudflare Pages. Key architecture points: events always have a host profile and only optionally belong to a community; native communities work like WhatsApp Communities (one umbrella, multiple sub-groups with independent chat, open-or-request-to-join); one unified form-builder system powers both event registration and community join-requests, not two separate implementations. Start with Phase 1 (scaffold + deploy pipeline) before writing any features — confirm it deploys successfully before we move to Phase 2. I'll give you the full data model, RLS policies, and page specs as we go.
