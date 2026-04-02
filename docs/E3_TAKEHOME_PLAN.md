# E3 Group — Full Stack Take-Home: Comprehensive Project Plan

## Table of Contents

1. [Assessment Analysis](#1-assessment-analysis)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Decisions (with Justifications)](#3-technology-decisions)
4. [Data Model Design](#4-data-model-design)
5. [Feature Implementation Plan](#5-feature-implementation-plan)
6. [AI Agent Strategy](#6-ai-agent-strategy)
7. [Deployment Pipeline](#7-deployment-pipeline)
8. [Seed Data Strategy](#8-seed-data-strategy)
9. [Evaluator Experience](#9-evaluator-experience)
10. [Timeline & Execution Order](#10-timeline--execution-order)
11. [Risk Register](#11-risk-register)
12. [Pre-Flight Checklist](#12-pre-flight-checklist)

---

## 1. Assessment Analysis

### What They're Actually Evaluating (Priority-Ordered)

| Area | Weight | What This Really Means |
|---|---|---|
| **Correctness** | High | Tenant isolation is king. A user in Org A must NEVER see Org B data — not through the UI, not through the API, not through search, not through AI summaries. Every query, mutation, upload, and AI call must be scoped. |
| **Review discipline** | High | They want to see you catch AI-generated bugs. BUGS.md must have real bugs with real commit SHAs showing the fix. This is proof you don't blindly trust AI output. |
| **Agent utilization** | High | They want evidence of parallel agent usage, smart task splitting, and human oversight. NOTES.md must show the agent's reasoning in real-time. |
| **Completeness** | High | Every feature listed must work. "Broken features count against you more than missing ones" — this means: implement everything, but if something is shaky, cut it cleanly rather than shipping broken. |
| **Operational readiness** | Medium | Logging, Docker, Railway. Not just "it runs" but "I can understand what happened in production." |

### Hidden Signals They're Looking For

E3 Group builds AI implementation agents for logistics companies. Their product automates enterprise deployments with autonomous configuration and testing. This means they deeply value:

- **Autonomous agent orchestration** — they literally build this. Your AI_USAGE.md is a window into whether you think like their team.
- **SOP adherence** — they codify workflows. Clean, predictable architecture > clever hacks.
- **Production discipline** — they deploy to enterprise customers. Logging, error handling, and tenant isolation are non-negotiable.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                           │
│          Next.js 15 (App Router) + TypeScript            │
│          Tailwind CSS + shadcn/ui                        │
│          TanStack Query (server state)                   │
│          Zustand (client state: org switching)           │
├─────────────────────────────────────────────────────────┤
│                    API LAYER                             │
│          Next.js Route Handlers (/app/api/*)             │
│          + Supabase Client (server-side)                 │
│          All mutations go through Route Handlers         │
│          (not direct Supabase from client)               │
├─────────────────────────────────────────────────────────┤
│                    BACKEND                               │
│          Supabase (hosted)                               │
│          ├── PostgreSQL + RLS policies                   │
│          ├── Auth (email/password)                       │
│          ├── Storage (file uploads)                      │
│          └── Edge Functions (if needed)                  │
├─────────────────────────────────────────────────────────┤
│                    AI LAYER                              │
│          MiniMax-M2.7 via OpenRouter                     │
│          Called from Route Handlers only                 │
│          Permission-checked before every call            │
├─────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                        │
│          Docker → Railway                                │
│          Environment variables for all secrets           │
└─────────────────────────────────────────────────────────┘
```

### Why This Architecture?

**Server-side API layer between frontend and Supabase:**
- **Why:** RLS is the last line of defense, not the only line. Route Handlers let us validate permissions in application code, log every mutation, and control exactly what data flows to the client. This is defense-in-depth.
- **Tradeoff:** Slightly more code than direct Supabase client calls. Worth it for auditability and correctness.
- **Scalability:** Route Handlers run as serverless functions on Railway. Each handler is isolated. Adding new endpoints doesn't affect existing ones.

**Supabase hosted (not self-hosted on Railway):**
- **Why:** Self-hosting Supabase on Railway means managing Postgres, GoTrue, PostgREST, and Storage yourself — that's an entire day of DevOps for no feature value. Hosted Supabase gives us managed auth, storage, and RLS out of the box.
- **Tradeoff:** Two services to manage (Railway + Supabase) instead of one. But Supabase's free tier is generous and the DX is far superior.
- **Scalability:** Supabase scales Postgres independently. Connection pooling via Supavisor handles concurrent connections.

---

## 3. Technology Decisions

### Frontend: Next.js 15 (App Router) + TypeScript

**Why:** The job description explicitly lists React and TypeScript. Next.js gives us both, plus SSR for initial page loads, API Route Handlers (eliminating a separate backend), and middleware for auth checks. App Router is the modern standard.

**Tradeoff:** App Router's learning curve and occasional hydration issues vs. Pages Router's simplicity. App Router wins because it gives us Server Components (less JS shipped to client) and better data fetching patterns.

**Scalability:** Server Components reduce client bundle size. Route Handlers scale independently. Middleware runs at the edge for auth checks.

### Styling: Tailwind CSS + shadcn/ui

**Why:** Speed of development. shadcn/ui gives us accessible, well-tested components (dialogs, dropdowns, forms) without writing them from scratch. Tailwind eliminates context-switching between CSS files. For a 24-hour build, this is the fastest path to a professional-looking UI.

**Tradeoff:** shadcn/ui components are copied into your project (not imported from node_modules). This means more code in the repo, but full control over customization. Worth it.

**Scalability:** Tailwind purges unused CSS. shadcn/ui components are tree-shakeable since they're local files.

### Server State: TanStack Query (React Query)

**Why:** Handles caching, background refetching, optimistic updates, and loading/error states. When a user creates a note, we can optimistically show it while the server confirms. When they switch orgs, TanStack Query can invalidate the cache for the old org and fetch fresh data.

**Tradeoff:** Additional dependency vs. using Next.js's built-in `fetch` with `revalidate`. TanStack Query wins because we need fine-grained cache control for org-switching (invalidate all queries when the active org changes).

**Scalability:** TanStack Query deduplicates identical requests and supports infinite scroll — important when we have 10k notes to paginate through.

### Client State: Zustand (for org context only)

**Why:** We need exactly one piece of global client state: the currently active organization. Zustand is 1KB, has no boilerplate, and integrates cleanly with TanStack Query (we can use the active org ID as a query key prefix).

**Tradeoff:** Could use React Context instead. Zustand wins because it doesn't cause unnecessary re-renders — only components that read the active org re-render when it changes.

**Scalability:** Zustand stores are independent. If we need more global state later, we add another store without touching existing code.

### AI: MiniMax-M2.7 via OpenRouter

**Why:** Victor's choice. MiniMax-M2.7 is a reasoning model at $0.30/1M input tokens and $1.20/1M output tokens — one of the cheapest frontier models available. It supports 205K context, which is overkill for note summaries but means we never hit context limits. OpenRouter gives us a unified API with fallback providers.

**Tradeoff:** Less proven than GPT-4o or Claude for structured output. Mitigation: we define a strict JSON schema for summaries and validate the output server-side before storing. If the model returns garbage, we surface an error rather than corrupting data.

**Scalability:** OpenRouter handles load balancing across providers. If MiniMax is slow, OpenRouter can fall back to other providers serving the same model.

### Database: Supabase PostgreSQL + Row-Level Security (RLS)

**Why:** The job description requires Supabase. PostgreSQL gives us JSONB for flexible note metadata, full-text search with `tsvector`, and RLS for tenant isolation at the database level.

**Tradeoff:** RLS adds complexity to every table. Every new table needs policies. But for multi-tenancy, RLS is the gold standard — even if the application code has a bug, the database won't leak data across orgs.

**Scalability:** PostgreSQL handles millions of rows. `tsvector` with GIN indexes makes full-text search fast even at 10k+ notes. RLS policies are evaluated per-row but PostgreSQL optimizes them into the query plan.

### File Storage: Supabase Storage

**Why:** Integrated with Supabase Auth. We can write storage policies that check the user's org membership — same pattern as RLS. Files are stored in S3-compatible storage behind Supabase's CDN.

**Tradeoff:** Less flexible than a custom S3 setup. But for this project, the auth integration is more valuable than flexibility.

**Scalability:** Supabase Storage handles files up to 5GB. CDN caching for reads.

### Deployment: Docker + Railway

**Why:** Required by the assessment. Railway supports Docker deployments with automatic HTTPS, environment variable management, and log streaming. Next.js standalone output produces a minimal Docker image (~150MB).

**Tradeoff:** Railway's free tier has limits (500 hours/month, 512MB RAM). The paid tier ($5/month) removes these limits. For a demo app, the free tier is sufficient if we're not running 24/7.

**Scalability:** Railway can auto-scale horizontally. Docker ensures the app runs identically everywhere.

---

## 4. Data Model Design

### Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   profiles   │────<│  org_memberships  │>────│organizations │
│              │     │                  │     │              │
│ id (= auth)  │     │ user_id          │     │ id           │
│ email        │     │ org_id           │     │ name         │
│ display_name │     │ role (enum)      │     │ slug         │
│ avatar_url   │     │ created_at       │     │ created_at   │
│ created_at   │     └──────────────────┘     │ updated_at   │
└──────────────┘                              └──────┬───────┘
                                                     │
                    ┌──────────────────┐              │
                    │      notes       │<─────────────┘
                    │                  │
                    │ id               │
                    │ org_id           │──── Every note belongs to exactly one org
                    │ created_by       │
                    │ title            │
                    │ content (text)   │
                    │ visibility       │──── 'private' | 'shared' | 'public'
                    │ tags (text[])    │──── PostgreSQL array for efficient querying
                    │ search_vector    │──── tsvector for full-text search
                    │ current_version  │
                    │ created_at       │
                    │ updated_at       │
                    └──────┬───────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
│ note_versions   │ │ note_shares │ │   files      │
│                 │ │             │ │              │
│ id              │ │ id          │ │ id           │
│ note_id         │ │ note_id     │ │ org_id       │
│ version_number  │ │ user_id     │ │ note_id (?)  │
│ title           │ │ created_at  │ │ uploaded_by  │
│ content         │ │             │ │ file_name    │
│ changed_by      │ └─────────────┘ │ file_path    │
│ change_summary  │                 │ file_size    │
│ created_at      │                 │ mime_type    │
└─────────────────┘                 │ created_at   │
                                    └──────────────┘
┌──────────────────┐
│  ai_summaries    │
│                  │
│ id               │
│ note_id          │
│ version_number   │──── Which version was summarized
│ summary (jsonb)  │──── Structured: {overview, key_points[], action_items[]}
│ status           │──── 'pending' | 'accepted' | 'rejected'
│ generated_at     │
│ accepted_at      │
│ accepted_by      │
└──────────────────┘

┌──────────────────┐
│   audit_logs     │
│                  │
│ id               │
│ org_id           │
│ user_id          │
│ action           │──── 'auth.login' | 'note.create' | 'ai.summary' | 'permission.denied' | ...
│ resource_type    │
│ resource_id      │
│ metadata (jsonb) │──── Flexible payload for each action type
│ ip_address       │
│ created_at       │
└──────────────────┘
```

### Key Design Decisions

**`tags` as `text[]` (PostgreSQL array) instead of a separate tags table:**
- **Why:** For a notes app, tags are simple strings. A join table adds complexity (tag normalization, orphan cleanup) with no benefit. PostgreSQL arrays support GIN indexes for fast `@>` (contains) queries.
- **Tradeoff:** No tag metadata (descriptions, colors). Acceptable for this scope.
- **Scalability:** GIN index on `text[]` handles millions of rows efficiently.

**`search_vector` as a materialized tsvector column:**
- **Why:** Computed on INSERT/UPDATE via a trigger. Combines `title` (weight A), `content` (weight B), and `tags` (weight C). This means search is pre-computed, not calculated at query time.
- **Tradeoff:** Extra storage (~200 bytes per row). At 10k notes, that's 2MB — negligible.
- **Scalability:** GIN index on tsvector makes full-text search O(log n). PostgreSQL's `ts_rank` handles relevance scoring.

**`note_versions` as a separate table (not JSONB array on notes):**
- **Why:** Versions can be large (full content snapshots). Storing them in a JSONB array on the notes table would make every note query load every version. Separate table = we only load versions when the user explicitly requests them.
- **Tradeoff:** More complex queries for "get note with latest version." Solved with `current_version` pointer on the notes table.
- **Scalability:** Versions grow linearly. With 10k notes × 5 avg versions = 50k rows. PostgreSQL handles this trivially.

**`visibility` enum instead of a boolean `is_public`:**
- **Why:** Three-tier visibility: `private` (only creator), `shared` (specific org members via `note_shares`), `public` (all org members). This gives users granular control.
- **Tradeoff:** More complex RLS policies. Worth it for the feature richness.

**`audit_logs` with JSONB metadata:**
- **Why:** Different actions have different payloads. An auth event needs IP and user-agent. A permission denial needs the resource and attempted action. JSONB lets us store heterogeneous data without 30 nullable columns.
- **Tradeoff:** Harder to query specific fields (need `->` operators). Mitigated with partial indexes on `action` type.

### RLS Policy Strategy

Every table gets these policies:

```sql
-- Example for `notes` table
-- SELECT: User can see notes in orgs they belong to, respecting visibility
CREATE POLICY "notes_select" ON notes FOR SELECT USING (
  org_id IN (
    SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
  )
  AND (
    visibility = 'public'
    OR created_by = auth.uid()
    OR (visibility = 'shared' AND id IN (
      SELECT note_id FROM note_shares WHERE user_id = auth.uid()
    ))
  )
);

-- INSERT: User can only create notes in orgs they belong to
CREATE POLICY "notes_insert" ON notes FOR INSERT WITH CHECK (
  org_id IN (
    SELECT org_id FROM org_memberships WHERE user_id = auth.uid()
  )
);

-- UPDATE: Only creator or admin can update
CREATE POLICY "notes_update" ON notes FOR UPDATE USING (
  created_by = auth.uid()
  OR org_id IN (
    SELECT org_id FROM org_memberships
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- DELETE: Only creator or admin can delete
CREATE POLICY "notes_delete" ON notes FOR DELETE USING (
  created_by = auth.uid()
  OR org_id IN (
    SELECT org_id FROM org_memberships
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
```

**Critical:** Every RLS policy uses `auth.uid()` — the authenticated user's ID from Supabase Auth. There is no way to bypass this without a valid JWT.

### Roles

```
'owner'  — Full control. Can delete org, manage members, see everything.
'admin'  — Can manage members, edit/delete any note in the org.
'member' — Can create notes, edit own notes, see public/shared notes.
```

---

## 5. Feature Implementation Plan

### Feature 1: Auth + Multi-Tenancy

**What:** Email/password sign-up and login. Users can create organizations, invite members, and switch between orgs. Every page checks that the user belongs to the active org.

**Implementation:**
- Supabase Auth for email/password (no OAuth needed — keep it simple)
- `profiles` table auto-created via a Supabase trigger on `auth.users` insert
- Org switching: Zustand store holds `activeOrgId`. All API calls include this. All TanStack Query keys include it (so switching orgs invalidates the cache and refetches).
- Next.js Middleware checks the auth session on every request. No session → redirect to `/login`.
- Route Handlers verify org membership before any operation.

**Permission enforcement:**
```
Page load → Middleware checks auth session
API call → Route Handler checks org_memberships for activeOrgId
Database → RLS policies enforce at row level
```
Three layers. If any one fails, the others catch it.

**Edge cases to handle:**
- User removed from org while actively using it → API returns 403 → frontend redirects to org picker
- User creates first org → auto-assigned 'owner' role
- Last owner can't leave org (prevents orphaned orgs)

### Feature 2: Notes CRUD + Tagging + Visibility

**What:** Create, read, update, delete notes. Add/remove tags. Set visibility to private/shared/public. Share with specific org members.

**Implementation:**
- Create: POST `/api/notes` → validates org membership, inserts note + creates version 1
- Read: GET `/api/notes` → paginated list with tag filtering, GET `/api/notes/[id]` → single note
- Update: PATCH `/api/notes/[id]` → validates ownership/admin, creates new version, updates `current_version`
- Delete: DELETE `/api/notes/[id]` → soft delete (set `deleted_at`) or hard delete (cascades to versions)
- Tags: Sent as part of note create/update. Autocomplete pulls distinct tags from the org's notes.
- Visibility: Dropdown on note editor. "Shared" opens a member picker.

**UI components:**
- Note list (sidebar or grid) with tag filters
- Note editor (rich text not required — Markdown or plain text is fine. A Markdown editor with preview would be a nice touch)
- Version history panel
- Share dialog

### Feature 3: Versioning + State Tracking

**What:** Every edit creates a new version. Users can view the history, see who changed what, and view diffs between versions.

**Implementation:**
- On note update: insert new row in `note_versions` with full content snapshot + `changed_by` + `change_summary`
- Increment `current_version` on the `notes` table
- Version history UI: list of versions with timestamps and authors
- Diff view: use `diff` library (like `diff` npm package) to compute and display character-level or line-level differences between any two versions
- Diff rendering: green for additions, red for deletions (standard diff UI)

**Why full snapshots instead of deltas:**
- **Simplicity:** Deltas require applying a chain of patches to reconstruct any version. Full snapshots let us load any version directly.
- **Tradeoff:** More storage. At 10k notes × 5 versions × ~2KB avg = 100MB. Within Supabase free tier limits.
- **Scalability:** If storage becomes an issue, we can archive old versions to Supabase Storage as JSON files.

### Feature 4: Search

**What:** Full-text search across titles, content, and tags. Must respect org boundaries and permissions. Must work at 10k note scale.

**Implementation:**
- PostgreSQL `tsvector` + GIN index (already in data model)
- Trigger on notes: `UPDATE search_vector = setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', content), 'B') || setweight(to_tsvector('english', array_to_string(tags, ' ')), 'C')`
- Search API: GET `/api/notes/search?q=...` → uses `plainto_tsquery` for user input, `ts_rank` for ordering
- RLS ensures search results only include notes the user can see (same policies as SELECT)
- Results show title, snippet (using `ts_headline`), tags, and relevance score

**Why PostgreSQL full-text search instead of Elasticsearch or Typesense:**
- **Why:** Zero additional infrastructure. The data is already in Postgres. RLS automatically applies to search queries. Adding Elasticsearch means syncing data, managing permissions separately, and running another service — all for 10k notes that Postgres handles trivially.
- **Tradeoff:** No fuzzy matching, no typo tolerance. Acceptable for this scope.
- **Scalability:** GIN indexes on tsvector handle millions of documents. At 10k notes, search is sub-millisecond.

### Feature 5: File Upload

**What:** Upload files associated with an org or a specific note. Files are only accessible to users with correct permissions.

**Implementation:**
- Supabase Storage with a bucket per org (bucket name = org ID)
- Storage policies mirror RLS: only org members can read/write files in their org's bucket
- Upload flow: client gets a signed upload URL from Route Handler (after permission check) → uploads directly to Supabase Storage → Route Handler records metadata in `files` table
- Download flow: client requests file → Route Handler checks permissions → returns signed download URL (time-limited)
- UI: file attachment on note editor + standalone file browser per org

**Why signed URLs instead of proxying through the API:**
- **Why:** Direct uploads to Supabase Storage are faster and don't consume API server memory/bandwidth.
- **Tradeoff:** Requires two API calls (get URL, then upload). Worth it for performance.

### Feature 6: AI Summary

**What:** Generate structured summaries per note. Users can review and selectively accept/reject the output. Permission-safe.

**Implementation:**
- "Generate Summary" button on note view (only visible if user has read access)
- Route Handler: verify user has access to note → fetch note content → call MiniMax-M2.7 via OpenRouter → parse structured output → store in `ai_summaries` with status 'pending'
- Structured output schema:
  ```json
  {
    "overview": "2-3 sentence summary",
    "key_points": ["point 1", "point 2", ...],
    "action_items": ["action 1", "action 2", ...],
    "tags_suggested": ["tag1", "tag2"]
  }
  ```
- UI: summary card below the note with "Accept" and "Reject" buttons
- Accept: updates status to 'accepted', optionally applies suggested tags
- Reject: updates status to 'rejected'
- Audit log entry for every AI request (input length, output length, latency, model used)

**Permission safety:**
- The AI never sees notes the requesting user can't see (permission check happens BEFORE the API call)
- Summaries inherit the note's visibility — if you can't see the note, you can't see its summary

**Error handling:**
- If MiniMax returns invalid JSON → log the error, surface "Summary generation failed" to user
- If OpenRouter is down → log the error, suggest retry
- Rate limiting: max 10 summaries per user per hour (prevent abuse/cost overrun)

### Feature 7: Logging

**What:** Meaningful operational visibility into auth events, mutations, AI requests, failures, and permission denials.

**Implementation:**
- `audit_logs` table with structured entries (see data model)
- Logged events:
  - `auth.login`, `auth.logout`, `auth.signup`, `auth.failed`
  - `note.create`, `note.update`, `note.delete`
  - `note.share`, `note.unshare`
  - `file.upload`, `file.download`, `file.delete`
  - `ai.summary.requested`, `ai.summary.completed`, `ai.summary.failed`
  - `ai.summary.accepted`, `ai.summary.rejected`
  - `permission.denied` (with attempted action and resource)
  - `org.create`, `org.member.add`, `org.member.remove`, `org.member.role_change`
- Server-side logging: every Route Handler logs to both the `audit_logs` table and `console.log` (for Railway's log stream)
- Admin UI: audit log viewer (filterable by event type, user, date range) — visible only to org owners/admins

**Why dual logging (DB + console):**
- DB logs are queryable and persistent — good for the admin UI
- Console logs flow to Railway's log stream — good for real-time debugging and operational monitoring

---

## 6. AI Agent Strategy

This section documents how to use AI coding agents effectively for this build. This is directly evaluated.

### Agent Setup

**Primary agent:** Claude Code (in terminal) — for all code generation, refactoring, and debugging.

**Parallel agent usage:**
- Run two Claude Code sessions in parallel: one for frontend, one for backend/database
- Use a third session for writing tests and reviewing generated code
- Agent 1 (Backend): Database schema, RLS policies, Route Handlers, seed script
- Agent 2 (Frontend): Components, pages, state management, UI
- Agent 3 (Review): Tests, BUGS.md, code review, security audit

### NOTES.md Strategy

Instruct the agent to append to NOTES.md after every significant action:
```
## [Timestamp] — [Action]
**Plan:** What the agent intends to do
**Reasoning:** Why this approach
**Result:** What happened
**Issues:** Any problems encountered
```

### AI_USAGE.md Structure

```markdown
# AI Usage Report

## Agents Used
- Claude Code (primary coding agent)
- [Any other agents]

## Work Split
| Agent | Task | Duration | Outcome |
|-------|------|----------|---------|

## Parallel Execution
- [What ran simultaneously and why]

## Where Agents Were Wrong
- [Specific examples with commit references]

## Where I Intervened
- [Manual corrections with reasoning]

## What I Don't Trust Agents To Do
- [Categories of work requiring human judgment]
```

### Review Process (for REVIEW.md)

**Deep review (every line):**
- All RLS policies — tenant isolation is the #1 evaluation criterion
- All Route Handlers — permission checks must be correct
- Auth middleware — session validation
- AI integration — prompt injection, output validation
- Seed script — must create realistic multi-tenant data

**Sampled review:**
- UI components — spot-check for accessibility and responsiveness
- Styling — visual inspection
- Error handling — test a few failure paths

**What I distrust most:**
- AI-generated RLS policies (complex boolean logic is where AI makes subtle errors)
- AI-generated SQL migrations (column types, constraints, default values)
- AI's understanding of Supabase auth context (`auth.uid()` usage)

---

## 7. Deployment Pipeline

### Docker Setup

```dockerfile
# Multi-stage build for minimal image size
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

**Why multi-stage:** Final image is ~150MB instead of ~1GB. Only production dependencies and compiled output.

### Railway Configuration

1. Create a Railway project
2. Add a service from the GitHub repo
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client)
   - `OPENROUTER_API_KEY`
   - `MINIMAX_MODEL=minimax/minimax-m2.7`
4. Railway auto-detects Dockerfile and builds
5. Enable health checks: GET `/api/health`

### CI/CD Flow

```
git push → Railway detects → Docker build → Deploy → Health check
```

No separate CI pipeline needed. Railway handles build + deploy. Git history IS the audit trail.

### Environment Variables Strategy

```
.env.local          → Local development (git-ignored)
.env.example        → Template with placeholder values (committed)
Railway dashboard   → Production values (encrypted)
```

**Never commit real secrets.** The `.env.example` file documents what's needed without exposing values.

---

## 8. Seed Data Strategy

### Requirements
- Multiple orgs (at least 3-4)
- Multiple users with varying roles across orgs
- Mix of visibility types (private, shared, public)
- Overlapping tags/titles across orgs (to test tenant isolation)
- Multiple note versions with visible state changes
- Some uploaded files
- ~10k notes total for search volume testing

### Seed Script Design

```
seed.ts (runs via: npx tsx scripts/seed.ts)

Organizations (4):
├── "Acme Corp"        — Large org, ~4000 notes
├── "Startup Labs"     — Medium org, ~3000 notes
├── "Research Group"   — Medium org, ~2000 notes
└── "Solo Ventures"    — Small org, ~1000 notes

Users (10):
├── alice@test.com     — Owner of Acme, Member of Startup Labs
├── bob@test.com       — Admin of Acme, Owner of Research Group
├── charlie@test.com   — Member of Acme, Admin of Startup Labs
├── diana@test.com     — Owner of Startup Labs, Member of Research Group
├── ... (6 more with overlapping memberships)

Notes (~10k):
├── Realistic titles from a predefined list of ~200 templates
├── Content generated from lorem ipsum + domain-specific text
├── Tags from a pool of ~50 tags, randomly assigned (2-5 per note)
├── Visibility: 60% public, 25% shared, 15% private
├── ~30% of notes have 2-5 versions with meaningful diffs
├── Overlapping titles/tags across orgs (critical for isolation testing)

Files (20-30):
├── Sample PDFs, images, text files
├── Associated with various orgs and notes
├── Mix of org-level and note-level attachments

AI Summaries (50-100):
├── Pre-generated for a subset of notes
├── Mix of accepted, rejected, and pending statuses
```

### Seed Script Performance

10k notes with versions = ~50k total inserts. Strategy:
- Use Supabase's batch insert (`upsert` with arrays)
- Disable RLS temporarily during seeding (use service role key)
- Re-enable RLS after seeding
- Total seed time target: < 60 seconds

### Test Credentials (in README)

```
Email: alice@test.com  |  Password: password123  |  Role: Owner @ Acme
Email: bob@test.com    |  Password: password123  |  Role: Admin @ Acme
Email: charlie@test.com|  Password: password123  |  Role: Member @ Acme
```

---

## 9. Evaluator Experience

### Making the Project Easy to Run

**One-command local setup:**
```bash
git clone <repo> && cd <repo> && cp .env.example .env.local
# Edit .env.local with your Supabase keys
npm install && npm run db:setup && npm run seed && npm run dev
```

**Scripts in package.json:**
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "db:setup": "npx tsx scripts/setup-database.ts",
  "db:reset": "npx tsx scripts/reset-database.ts",
  "seed": "npx tsx scripts/seed.ts",
  "lint": "eslint . --ext .ts,.tsx",
  "type-check": "tsc --noEmit"
}
```

### Tools for AI-Assisted Comprehension

Since the evaluator will use AI to understand the project, provide:

1. **ARCHITECTURE.md** — Machine-readable project map:
   ```markdown
   # Architecture
   ## Directory Structure (with purpose of each folder)
   ## Data Flow Diagrams (text-based, parseable by AI)
   ## API Endpoint Reference (method, path, auth, description)
   ## Database Schema (table, columns, relationships, RLS summary)
   ```

2. **Inline code comments** — Not just "what" but "why":
   ```typescript
   // We check org membership BEFORE calling Supabase, even though RLS
   // would catch it, because we want to log permission denials with
   // the specific user and resource for the audit trail.
   ```

3. **DECISIONS.md** — Technical decision log:
   ```markdown
   ## Decision: PostgreSQL full-text search over Elasticsearch
   **Context:** Need search across 10k notes
   **Options:** Postgres tsvector, Elasticsearch, Typesense, Meilisearch
   **Decision:** Postgres tsvector
   **Reasoning:** [...]
   ```

4. **API.md** — Complete API reference with curl examples:
   ```markdown
   ## POST /api/notes
   Creates a new note in the active organization.
   ### Headers
   - Authorization: Bearer <token>
   - x-org-id: <org-id>
   ### Body
   { "title": "...", "content": "...", "tags": [...], "visibility": "public" }
   ### Response
   { "id": "...", "title": "...", ... }
   ### Errors
   - 401: Not authenticated
   - 403: Not a member of this org
   - 422: Validation error
   ```

---

## 10. Timeline & Execution Order

### Phase 0: Setup (1 hour)

| # | Task | Details |
|---|------|---------|
| 0.1 | Create Railway account | Sign up, add payment method |
| 0.2 | Create Supabase project | New project, note the URL and keys |
| 0.3 | Init Next.js project | `npx create-next-app@latest --typescript --tailwind --app --src-dir` |
| 0.4 | Install dependencies | shadcn/ui, TanStack Query, Zustand, Supabase client, diff library |
| 0.5 | Set up project structure | Create folder skeleton (see below) |
| 0.6 | Init git, first commit | "Initial project setup" |
| 0.7 | Create NOTES.md, AI_USAGE.md, BUGS.md, REVIEW.md | Empty templates with structure |

### Phase 1: Database + Auth (3 hours)

| # | Task | Agent |
|---|------|-------|
| 1.1 | Write SQL migrations (all tables, indexes, triggers) | Agent 1 |
| 1.2 | Write RLS policies for every table | Agent 1 |
| 1.3 | Run migrations on Supabase | Agent 1 |
| 1.4 | Set up Supabase Auth (email/password) | Agent 1 |
| 1.5 | Build auth pages (login, signup) | Agent 2 (parallel) |
| 1.6 | Build auth middleware (Next.js) | Agent 2 (parallel) |
| 1.7 | Build org creation + switching UI | Agent 2 (parallel) |
| 1.8 | **REVIEW: Manually audit every RLS policy** | Human |
| 1.9 | Test: create 2 users, 2 orgs, verify isolation | Human |

### Phase 2: Notes CRUD + Versioning (4 hours)

| # | Task | Agent |
|---|------|-------|
| 2.1 | Build Route Handlers for notes CRUD | Agent 1 |
| 2.2 | Build versioning logic (auto-version on update) | Agent 1 |
| 2.3 | Build note list UI (with pagination) | Agent 2 (parallel) |
| 2.4 | Build note editor UI | Agent 2 (parallel) |
| 2.5 | Build tagging UI (add/remove, autocomplete) | Agent 2 (parallel) |
| 2.6 | Build visibility controls + sharing UI | Agent 2 |
| 2.7 | Build version history + diff viewer | Agent 2 |
| 2.8 | Wire frontend to API with TanStack Query | Agent 2 |
| 2.9 | **REVIEW: Test CRUD across orgs, visibility types** | Human |

### Phase 3: Search + Files + AI (4 hours)

| # | Task | Agent |
|---|------|-------|
| 3.1 | Build search Route Handler + UI | Agent 1 + Agent 2 |
| 3.2 | Set up Supabase Storage buckets + policies | Agent 1 |
| 3.3 | Build file upload/download Route Handlers | Agent 1 |
| 3.4 | Build file upload UI (on notes + standalone) | Agent 2 (parallel) |
| 3.5 | Integrate MiniMax-M2.7 via OpenRouter | Agent 1 |
| 3.6 | Build AI summary UI (generate, accept, reject) | Agent 2 (parallel) |
| 3.7 | **REVIEW: Test search isolation, file permissions, AI permissions** | Human |

### Phase 4: Logging + Polish (3 hours)

| # | Task | Agent |
|---|------|-------|
| 4.1 | Implement audit logging across all Route Handlers | Agent 1 |
| 4.2 | Build admin audit log viewer | Agent 2 |
| 4.3 | Add error boundaries + loading states | Agent 2 |
| 4.4 | Responsive design pass | Agent 2 |
| 4.5 | **REVIEW: Check every Route Handler has logging** | Human |

### Phase 5: Seed Data + Deployment (3 hours)

| # | Task | Agent |
|---|------|-------|
| 5.1 | Write seed script (10k notes + all supporting data) | Agent 1 |
| 5.2 | Run seed, verify search performance | Agent 1 |
| 5.3 | Write Dockerfile | Agent 1 |
| 5.4 | Deploy to Railway | Human (some manual config) |
| 5.5 | Verify deployment works end-to-end | Human |
| 5.6 | Write ARCHITECTURE.md, DECISIONS.md, API.md | Agent 3 |

### Phase 6: Documentation + Video (3-4 hours)

| # | Task | Owner |
|---|------|-------|
| 6.1 | Finalize NOTES.md (review agent's logs) | Human |
| 6.2 | Write AI_USAGE.md | Human |
| 6.3 | Write BUGS.md (with commit SHAs) | Human |
| 6.4 | Write REVIEW.md | Human |
| 6.5 | Record 5-min demo video | Human |
| 6.6 | Final README polish | Agent |
| 6.7 | **Final review: full walkthrough as a new user** | Human |

### Total: ~21-22 hours (leaves 2-3 hours buffer)

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RLS policies have subtle bugs allowing cross-org data leaks | Medium | Critical | Manual review of every policy. Integration tests with 2+ users in different orgs. |
| MiniMax-M2.7 returns malformed JSON | Medium | Low | Validate with Zod schema. Fallback to error state. Never store invalid output. |
| Seed script takes too long for 10k notes | Low | Medium | Batch inserts. Use service role key (bypasses RLS). Target < 60s. |
| Railway deployment fails | Low | High | Test Docker build locally first. Have `.env.example` ready. Railway has good error logs. |
| Supabase free tier limits hit during development | Low | Medium | Supabase free tier allows 500MB DB and 1GB storage. 10k notes ≈ 100MB. Well within limits. |
| AI agent generates incorrect Supabase client usage | High | Medium | Review every Supabase call. Common mistakes: using `anon` key where `service_role` is needed, forgetting `auth.uid()` in RLS, wrong `from()` syntax. |
| Diff library doesn't render well for large notes | Low | Low | Limit diff view to first 5000 characters. Add "Show full diff" toggle. |
| Time overrun on one phase | Medium | High | Each phase has a hard cutoff. If behind, cut UI polish first, then advanced features. Core features (auth, CRUD, search, RLS) are non-negotiable. |

---

## 12. Pre-Flight Checklist

Before recording the demo video, verify every item:

### Correctness (High Weight)
- [ ] User A in Org X cannot see Org Y's notes via UI
- [ ] User A in Org X cannot see Org Y's notes via API (test with curl)
- [ ] User A in Org X cannot search Org Y's notes
- [ ] User A in Org X cannot access Org Y's files
- [ ] User A in Org X cannot generate AI summaries for Org Y's notes
- [ ] Private notes are only visible to the creator
- [ ] Shared notes are only visible to shared users + creator
- [ ] Role-based actions work (member can't delete other's notes, admin can)

### Features (High Weight)
- [ ] Sign up / login / logout works
- [ ] Create org, switch orgs works
- [ ] Full notes CRUD works
- [ ] Tags: add, remove, filter by tag works
- [ ] Visibility: private/shared/public works
- [ ] Version history shows all changes
- [ ] Diff viewer shows differences between versions
- [ ] Search returns relevant results
- [ ] Search respects org boundaries
- [ ] File upload works
- [ ] File download works (with permissions)
- [ ] AI summary generation works
- [ ] AI summary accept/reject works
- [ ] Audit log shows events

### Operational Readiness (Medium Weight)
- [ ] Docker build succeeds locally
- [ ] Railway deployment is live and accessible
- [ ] Health check endpoint works
- [ ] Logs are visible in Railway dashboard
- [ ] Environment variables are not exposed in client-side code

### Deliverables
- [ ] NOTES.md — has real-time agent logs
- [ ] AI_USAGE.md — documents agent strategy
- [ ] BUGS.md — has bugs with commit SHAs and fixes
- [ ] REVIEW.md — documents review strategy and findings
- [ ] ARCHITECTURE.md — machine-readable project map
- [ ] Git history — frequent, descriptive commits
- [ ] Demo video — ~5 minutes, covers all features
- [ ] Seed data — 10k notes, multiple orgs/users

---

## Appendix: Project Folder Structure

```
e3-team-notes/
├── .github/
├── public/
├── scripts/
│   ├── seed.ts                  # Seed script (10k notes)
│   ├── setup-database.ts        # Run migrations
│   └── reset-database.ts        # Drop and recreate
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx       # Sidebar + org switcher
│   │   │   ├── notes/
│   │   │   │   ├── page.tsx     # Note list
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx # Note detail + editor
│   │   │   │       └── versions/page.tsx
│   │   │   ├── files/page.tsx
│   │   │   ├── search/page.tsx
│   │   │   └── admin/
│   │   │       ├── members/page.tsx
│   │   │       └── audit-log/page.tsx
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── notes/
│   │   │   │   ├── route.ts     # GET (list), POST (create)
│   │   │   │   ├── [id]/route.ts # GET, PATCH, DELETE
│   │   │   │   ├── [id]/versions/route.ts
│   │   │   │   ├── [id]/share/route.ts
│   │   │   │   └── search/route.ts
│   │   │   ├── files/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/route.ts
│   │   │   ├── ai/
│   │   │   │   └── summary/route.ts
│   │   │   ├── orgs/
│   │   │   │   ├── route.ts
│   │   │   │   └── [id]/members/route.ts
│   │   │   └── audit-logs/route.ts
│   │   ├── layout.tsx           # Root layout (providers)
│   │   └── page.tsx             # Landing / redirect
│   ├── components/
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── notes/               # Note-specific components
│   │   ├── files/               # File-specific components
│   │   ├── orgs/                # Org switcher, member list
│   │   └── layout/              # Sidebar, header, etc.
│   ├── hooks/                   # Custom React hooks
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts        # Browser client
│   │   │   ├── server.ts        # Server client (Route Handlers)
│   │   │   └── admin.ts         # Service role client (seed/migrations)
│   │   ├── ai/
│   │   │   └── openrouter.ts    # MiniMax integration
│   │   ├── logger.ts            # Audit logging utility
│   │   └── utils.ts
│   ├── stores/
│   │   └── org-store.ts         # Zustand store for active org
│   └── types/
│       └── index.ts             # TypeScript types for all entities
├── supabase/
│   └── migrations/              # SQL migration files
│       ├── 001_create_tables.sql
│       ├── 002_create_rls_policies.sql
│       ├── 003_create_triggers.sql
│       └── 004_create_indexes.sql
├── Dockerfile
├── docker-compose.yml           # For local dev (optional)
├── .env.example
├── next.config.ts
├── package.json
├── tsconfig.json
├── NOTES.md
├── AI_USAGE.md
├── BUGS.md
├── REVIEW.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── API.md
└── README.md
```

---

## 13. Gap Analysis (Compliance Audit)

A line-by-line audit of the original takehome requirements against this plan revealed **27 gaps** across 4 severity levels. All gaps have been assigned to specific phase/task for resolution.

### CRITICAL — Will cause build failure or evaluation failure

#### GAP-1: Dockerfile `--only=production` Bug
**Location:** §7 Dockerfile snippet  
**Problem:** `npm ci --only=production` omits dev dependencies (TypeScript, ESLint). The `builder` stage copies these node_modules and runs `npm run build` — TypeScript is not installed, build fails.  
**Fix:** Change to `npm ci` (full install). → Resolved in Phase 5, B5.1.

#### GAP-2: Missing `output: 'standalone'` in next.config.ts
**Location:** §7 Dockerfile references `.next/standalone` but §10 Phase 0 never mentions configuring this.  
**Problem:** Without `output: 'standalone'` in `next.config.ts`, the standalone folder is never generated. Docker image has no entrypoint.  
**Fix:** Add `output: 'standalone'` to `next.config.ts` in Phase 0 setup. → Resolved in Phase 0, A0.2.

#### GAP-3: Soft Delete vs. Hard Delete Unresolved
**Location:** §5 Feature 2  
**Problem:** Plan says "soft delete (set `deleted_at`) or hard delete (cascades to versions)" — undecided. Schema in §4 has no `deleted_at` column.  
**Decision: Hard delete** with `ON DELETE CASCADE` from `notes` → `note_versions`, `note_shares`, `files` (SET NULL on note_id), `ai_summaries`. → Resolved in Phase 1, A1.1.

#### GAP-18: RLS UPDATE/DELETE Policies Exclude 'owner' Role
**Location:** §4 RLS policies  
**Problem:** The `notes_update` and `notes_delete` policies check `role = 'admin'` only. But owners have "Full control" per §4 Roles. Owners CANNOT update or delete other members' notes.  
**Fix:** Change `role = 'admin'` to `role IN ('admin', 'owner')` in ALL policies. → Resolved in Phase 1, A1.2.

#### GAP-19: RLS SELECT Policy Excludes Admin/Owner Override for Private Notes
**Location:** §4 RLS `notes_select` policy  
**Problem:** The SELECT policy has no admin/owner override. Admins can UPDATE/DELETE a note (per those policies) but cannot SELECT it first. The UPDATE silently affects 0 rows.  
**Fix:** Add admin/owner clause to `notes_select`:
```sql
OR org_id IN (
  SELECT org_id FROM org_memberships
  WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
)
```
→ Resolved in Phase 1, A1.2.

#### GAP-20: Missing `@supabase/ssr` Dependency
**Location:** §10 Phase 0 task 0.4  
**Problem:** `@supabase/ssr` is **required** for creating authenticated Supabase clients in Next.js Route Handlers and Middleware. Without it, Route Handlers can't carry the user's JWT, and RLS won't work.  
**Fix:** Add `@supabase/ssr` to dependency list. The three clients:
- `client.ts` → `createBrowserClient` from `@supabase/ssr`
- `server.ts` → `createServerClient` from `@supabase/ssr` (reads cookies, user JWT, RLS works)
- `admin.ts` → `createClient` from `@supabase/supabase-js` with service role key (bypasses RLS)
→ Resolved in Phase 0, A0.3 + A0.8.

#### GAP-21: Supabase Email Confirmation Will Block Seed Script and Login
**Location:** §8 Seed Data Strategy  
**Problem:** Default Supabase requires email confirmation. Seed users can't log in, evaluator can't use test credentials.  
**Fix:** (1) Disable email confirmation in Supabase dashboard. (2) Seed script uses `supabase.auth.admin.createUser({ email_confirm: true })`. → Resolved in Phase 0 H0.2 + Phase 5 A5.1.

#### GAP-22: Server-Side Supabase Client Must Use User's JWT, Not Service Role Key
**Location:** §2 Architecture  
**Problem:** The plan's "three layers of defense" ONLY works if Route Handlers use a Supabase client carrying the user's JWT. If the agent uses the service role key in Route Handlers (a common AI mistake), RLS is completely bypassed.  
**Rule:** `server.ts` MUST use `createServerClient` from `@supabase/ssr`. The `admin.ts` client (service role) is ONLY for scripts/migrations. NEVER in Route Handlers. → Enforced as Cross-cutting Rule #3.

### HIGH — Misses key evaluation criteria

#### GAP-4: Git Commit Strategy Underemphasized
**Location:** §10 Phase 0  
**Problem:** Original says: "Have the agent both log its notes and its changes frequently with git explaining what changed and why. We use your commit history to understand your reasoning." Plan mentions git once.  
**Fix:** Every agent commits after each task. Format: `[area] description — why`. → Enforced as Cross-cutting Rule #1.

#### GAP-5: NOTES.md Scope Too Narrow
**Location:** §6 NOTES.md Strategy  
**Problem:** Plan says "after every significant action." Original says "a running scratchpad throughout the build."  
**Fix:** Append after EVERY action, not just significant ones. → Enforced as Cross-cutting Rule #2.

#### GAP-6: Missing RLS Policies for 5+ Tables
**Location:** §4 RLS Policy Strategy  
**Problem:** Only `notes` has written RLS. Missing: `org_memberships`, `note_shares`, `files`, `ai_summaries`, `audit_logs`, `profiles`.  
**Fix:** Policy intent for each table:

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `org_memberships` | Members see memberships in their orgs | Owner/admin can add | Owner/admin can change roles | Owner/admin can remove (not last owner) |
| `note_shares` | See shares for notes you can access | Note creator + admin/owner | N/A (delete+recreate) | Note creator + admin/owner |
| `files` | Org members see file metadata in their org | Org members can upload | N/A (immutable) | Uploader + admin/owner |
| `ai_summaries` | See summaries for notes you can access | Org members (via API) | Accept/reject by note viewer | Admin/owner only |
| `audit_logs` | Owner/admin view their org's logs | Service role / DB function only | Never | Never |
| `profiles` | All authenticated users (for member picker) | Trigger only | User updates own profile | Never |

→ Resolved in Phase 1, A1.2.

#### GAP-7: AI Rate Limiting Undesigned
**Location:** §5 Feature 6  
**Problem:** "max 10 per hour" stated, no implementation.  
**Fix:** Count rows in `audit_logs` where `action = 'ai.summary.requested' AND user_id = ? AND created_at > NOW() - INTERVAL '1 hour'`. → Resolved in Phase 3, A3.5.

### MEDIUM — Design gaps requiring decisions before coding

#### GAP-9: Member Invitation Flow Not Designed
**Decision:** Admin/owner searches existing users by email → adds directly to `org_memberships`. No email invitation flow. → Resolved in Phase 1, B1.9.

#### GAP-10: MiniMax-M2.7 Model ID Unverified
**Fix:** Verify `minimax/minimax-m2.7` on OpenRouter before Phase 3. Fallback: `google/gemini-2.0-flash`. → Resolved in Phase 3, A3.2.

#### GAP-12: No Zod Validation for AI Output
**Fix:** Add `zod` to deps. Define schema matching summary JSON structure. Use `.safeParse()`. → Resolved in Phase 0 A0.3 + Phase 3 A3.2.

#### GAP-13: Profile Creation Trigger Not in Migration Plan
**Fix:** Assign to `003_create_triggers.sql`: trigger on `auth.users` INSERT → insert into `profiles`. → Resolved in Phase 1, A1.3.

#### GAP-14: Search Vector Trigger Not Assigned to Migration File
**Fix:** Assign to `003_create_triggers.sql`: trigger on `notes` INSERT/UPDATE → recompute `search_vector`. → Resolved in Phase 1, A1.3.

#### GAP-23: `note_shares` Missing Org Boundary Validation
**Problem:** Can share with users outside the note's org. RLS blocks access but dangling record is messy.  
**Fix:** Validate in Route Handler: target user must be in `org_memberships` for the note's org. → Resolved in Phase 2, A2.7.

#### GAP-24: Seed Script File Upload Mechanism Unspecified
**Fix:** Seed script generates small text files, uploads to Supabase Storage via admin client, creates buckets. → Resolved in Phase 5, A5.6.

#### GAP-25: `x-org-id` Header Not in Main Architecture
**Fix:** Make explicit: every API call includes `x-org-id` header. Zustand store wired into TanStack Query default headers. → Resolved in Phase 1, B1.3 + Cross-cutting Rule #4.

#### GAP-26: "Failures" Logging Scope Incomplete
**Problem:** Only AI failures logged, not 500s, failed uploads, failed DB ops.  
**Fix:** Generic error wrapper for Route Handlers + structured console.error. → Resolved in Phase 4, A4.1-A4.2.

#### GAP-27: Deployment "Built with agents" Requirement
**Problem:** Plan marks Railway deploy as Human. Original says "built with agents."  
**Fix:** Agent writes Dockerfile + docker-compose + railway.toml + health check. Human only does browser dashboard steps. → Resolved in Phase 5, B5.1-B5.3.

### LOW — Clarifications

#### GAP-11: Next.js search/[id] Route Order
Plan is correct (search as sibling to [id]). Confirmed in folder skeleton.

#### GAP-15: ARCHITECTURE.md/DECISIONS.md/API.md Listed as Required
Reclassified as bonus deliverables. Build only if time permits.

#### GAP-16: docker-compose.yml Deferred
Decision: include it. → Resolved in Phase 5, B5.2.

#### GAP-17: REVIEW.md Template Missing
Added template:
```markdown
# Code Review Report
## What I Reviewed Deeply (every line)
## What I Sampled
## What I Distrusted Most
## What I'd Review Next With More Time
```
→ Resolved in Phase 0, A0.11.

---

## 14. Phased Execution Plan with Concurrency

### Cross-Cutting Rules (Apply to ALL Phases)

1. **Git commits:** After every logical unit of work, commit with format: `[area] description — why`. Never batch multiple features into one commit.
2. **NOTES.md:** Append after EVERY action. Format: `## [Timestamp] — [Action]\n**Plan:** ...\n**Reasoning:** ...\n**Result:** ...\n**Issues:** ...`
3. **Server Supabase client rule:** Route Handlers use `createServerClient` from `@supabase/ssr` (carries user JWT, RLS applies). The `admin.ts` client is ONLY for scripts/migrations. NEVER use service role key in Route Handlers.
4. **`x-org-id` header:** Every API call from frontend includes `x-org-id` header. Every Route Handler reads it and verifies org membership before proceeding.
5. **shadcn/ui:** All UI components must use shadcn/ui primitives (Button, Dialog, DropdownMenu, Input, Form, Table, Tabs, Badge, Card, Toast, etc.). No custom component libraries. Extend shadcn components when needed.

---

### Phase 0: Project Bootstrap (Sequential — Single Agent + Human)

**Duration:** ~45 min  
**Agents:** 1 agent + human for Supabase dashboard  
**Dependency:** None

#### Human Tasks (do first, in browser)
| # | Task |
|---|------|
| H0.1 | Create Supabase project — note URL, anon key, service role key |
| H0.2 | Supabase Auth → Settings → disable "Enable email confirmations" |
| H0.3 | Create Railway account if needed |
| H0.4 | Create `.env.local` with real keys |

#### Agent Tasks (single agent, sequential)
| # | Task | GAPs Addressed |
|---|------|----------------|
| A0.1 | `npx create-next-app@latest --typescript --tailwind --app --src-dir` | — |
| A0.2 | Set `output: 'standalone'` in `next.config.ts` | GAP-2 |
| A0.3 | Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `@tanstack/react-query`, `zustand`, `zod`, `diff` | GAP-20, GAP-12 |
| A0.4 | Init shadcn/ui: `npx shadcn@latest init` + install core components (button, dialog, dropdown-menu, input, form, table, tabs, badge, card, toast, separator, skeleton, avatar, select, textarea, popover, command, label, checkbox, scroll-area, sheet) | — |
| A0.5 | Create folder skeleton (see Appendix) | — |
| A0.6 | Create `.env.example` with all vars documented | — |
| A0.7 | Create TypeScript types in `src/types/index.ts` (all entities from data model) | — |
| A0.8 | Create three Supabase clients: `client.ts` (browser), `server.ts` (SSR with cookies), `admin.ts` (service role) | GAP-22 |
| A0.9 | Create `src/lib/logger.ts` — audit logging utility (writes to audit_logs table + console) | GAP-26 |
| A0.10 | Create error wrapper for Route Handlers (`withErrorHandler` HOF) | GAP-26 |
| A0.11 | Create template files: NOTES.md, AI_USAGE.md, BUGS.md, REVIEW.md | GAP-17 |
| A0.12 | Init git, first commit: `[setup] Initialize Next.js project with deps and folder skeleton` | GAP-4 |

**Exit criteria:** Project runs with `npm run dev`, shows Next.js default page, git repo initialized with 1+ commits.

---

### Phase 1: Database + Auth Foundation

**Duration:** ~3 hours  
**Agents:** 2 concurrent agents  
**Dependency:** Phase 0 complete

#### Agent A — Database & Backend Foundation

| # | Task | GAPs Addressed |
|---|------|----------------|
| A1.1 | Write `001_create_tables.sql` — all 9 tables. Hard delete with `ON DELETE CASCADE`. | GAP-3 |
| A1.2 | Write `002_create_rls_policies.sql` — ALL 9 tables. `role IN ('admin', 'owner')` everywhere. Admin/owner override in notes_select. | GAP-6, GAP-18, GAP-19 |
| A1.3 | Write `003_create_triggers.sql` — profile creation + search_vector recompute | GAP-13, GAP-14 |
| A1.4 | Write `004_create_indexes.sql` — GIN on search_vector, GIN on tags, btree on org_id/user_id/created_at | — |
| A1.5 | Write `scripts/setup-database.ts` — runs all migrations via admin client | — |
| A1.6 | Run migrations on Supabase project | — |
| A1.7 | Build auth Route Handlers — login, signup, logout (with audit logging) | — |
| A1.8 | Build org Route Handlers — CRUD orgs, manage members | — |
| A1.9 | Build Next.js Middleware — check auth session, redirect unauthenticated to /login | — |
| A1.10 | Commit after each file | GAP-4 |

#### Agent B — Frontend Auth & Layout (concurrent with Agent A)

All UI built with shadcn/ui components.

| # | Task | GAPs Addressed |
|---|------|----------------|
| B1.1 | Build TanStack Query provider in root layout | — |
| B1.2 | Build Zustand org store — `activeOrgId`, persist to localStorage | GAP-25 |
| B1.3 | Configure TanStack Query defaults — `x-org-id` header, org-based query key prefixes | GAP-25 |
| B1.4 | Build login page — shadcn Form + Input + Button, Supabase Auth call | — |
| B1.5 | Build signup page — shadcn Form + Input + Button, create account | — |
| B1.6 | Build dashboard layout — shadcn Sheet (mobile sidebar) + navigation, header with Avatar | — |
| B1.7 | Build org creation — shadcn Dialog + Form | — |
| B1.8 | Build org switcher — shadcn DropdownMenu, switching invalidates cache | — |
| B1.9 | Build member management — shadcn Table + Dialog, add by email, change roles via Select, remove | GAP-9 |
| B1.10 | Commit after each component group | GAP-4 |

#### REVIEW CHECKPOINT (Human)
- [ ] Manually audit every RLS policy
- [ ] Test: 2 users, 2 orgs, verify isolation via API
- [ ] Test: middleware redirects unauthenticated
- [ ] Log findings to BUGS.md

**Exit criteria:** Auth + org management working. RLS proven correct.

---

### Phase 2: Notes CRUD + Versioning + Tagging

**Duration:** ~3.5 hours  
**Agents:** 2 concurrent agents  
**Dependency:** Phase 1 complete

#### Agent A — Notes Backend

| # | Task | GAPs Addressed |
|---|------|----------------|
| A2.1 | `POST /api/notes` — create note + version 1, validate org membership, audit log | — |
| A2.2 | `GET /api/notes` — paginated list, tag filtering via `@>`, RLS visibility | — |
| A2.3 | `GET /api/notes/[id]` — single note with current version | — |
| A2.4 | `PATCH /api/notes/[id]` — update, new version, increment current_version, audit log | — |
| A2.5 | `DELETE /api/notes/[id]` — hard delete with cascade, audit log | GAP-3 |
| A2.6 | `GET /api/notes/[id]/versions` — list all versions | — |
| A2.7 | `POST/DELETE /api/notes/[id]/share` — with org boundary validation | GAP-23 |
| A2.8 | `GET /api/notes/tags?q=...` — tag autocomplete | — |
| A2.9 | Commit after each endpoint | GAP-4 |

#### Agent B — Notes Frontend (concurrent with Agent A)

All UI built with shadcn/ui components.

| # | Task |
|---|------|
| B2.1 | Note list page — shadcn Card grid, pagination, Skeleton loading |
| B2.2 | Tag filter sidebar — shadcn Badge for tags, active filter state |
| B2.3 | Note editor — shadcn Form + Input + Textarea, tag input with shadcn Command (autocomplete) + Popover |
| B2.4 | Visibility dropdown — shadcn Select (private/shared/public) |
| B2.5 | Share dialog — shadcn Dialog + Command (member search) + Badge (shared users) |
| B2.6 | Version history panel — shadcn Table with timestamp, author, change summary |
| B2.7 | Diff viewer — green/red diff rendering using `diff` lib, shadcn Tabs for switching versions |
| B2.8 | Wire all to TanStack Query hooks |
| B2.9 | Commit after each component group |

#### REVIEW CHECKPOINT (Human)
- [ ] CRUD across orgs, verify isolation
- [ ] Visibility: private/shared/public tested
- [ ] Versioning + diff between versions
- [ ] Admin/owner access to private notes

**Exit criteria:** Full notes CRUD with tagging, visibility, sharing, version diffs.

---

### Phase 3: Search + Files + AI

**Duration:** ~3.5 hours  
**Agents:** 3 concurrent agents  
**Dependency:** Phase 2 complete

#### Agent A — Search + AI Backend

| # | Task | GAPs Addressed |
|---|------|----------------|
| A3.1 | `GET /api/notes/search?q=...` — plainto_tsquery, ts_rank, ts_headline, RLS | — |
| A3.2 | `src/lib/ai/openrouter.ts` — OpenRouter client, verified model ID, Zod schema | GAP-10, GAP-12 |
| A3.3 | `POST /api/ai/summary` — permission check → fetch note → OpenRouter → Zod validate → store pending → audit | GAP-7 |
| A3.4 | `PATCH /api/ai/summary/[id]` — accept/reject | — |
| A3.5 | Rate limiting: count in audit_logs, reject if ≥ 10/hour | GAP-7 |
| A3.6 | Commit after each endpoint | — |

#### Agent B — File Upload Backend (concurrent)

| # | Task |
|---|------|
| B3.1 | Create Supabase Storage buckets + write storage policies |
| B3.2 | `POST /api/files` — permission check → signed upload URL |
| B3.3 | `POST /api/files/confirm` — record metadata → audit log |
| B3.4 | `GET /api/files` — list files in org (optionally by note_id) |
| B3.5 | `GET /api/files/[id]` — signed download URL |
| B3.6 | `DELETE /api/files/[id]` — remove from storage + DB → audit log |
| B3.7 | Commit after each endpoint |

#### Agent C — Search + Files + AI Frontend (concurrent)

All UI built with shadcn/ui components.

| # | Task |
|---|------|
| C3.1 | Search page — shadcn Input + Card results with Badge tags, Skeleton loading |
| C3.2 | File upload component — drag-and-drop zone, shadcn Button, progress indicator |
| C3.3 | File browser page — shadcn Table with download/delete actions |
| C3.4 | File attachments on note detail — inline file list + upload |
| C3.5 | AI summary card — shadcn Card with "Generate Summary" Button, loading Skeleton, structured result display |
| C3.6 | Accept/reject UI — shadcn Button pair, Toast on success |
| C3.7 | Summary history — shadcn Tabs or Accordion for past summaries |
| C3.8 | Wire all to TanStack Query |
| C3.9 | Commit after each component group |

#### REVIEW CHECKPOINT (Human)
- [ ] Search isolation across orgs
- [ ] File upload/download/delete with permissions
- [ ] AI summary generate/accept/reject
- [ ] AI permission safety

**Exit criteria:** Search, files, and AI all working with correct permissions.

---

### Phase 4: Logging + Polish + Error Handling

**Duration:** ~2.5 hours  
**Agents:** 2 concurrent agents  
**Dependency:** Phase 3 complete

#### Agent A — Logging & Error Handling Backend

| # | Task | GAPs Addressed |
|---|------|----------------|
| A4.1 | Audit every Route Handler — verify audit logging for success AND failure | GAP-26 |
| A4.2 | Add `withErrorHandler` wrapper to any handlers missing it | GAP-26 |
| A4.3 | `GET /api/audit-logs` — filterable by event type, user, date range. Owner/admin only. | — |
| A4.4 | Verify permission.denied logged for every 403 | — |
| A4.5 | Structured console.log for Railway (JSON: timestamp, action, user, org, resource) | — |
| A4.6 | Commit after each improvement | — |

#### Agent B — Frontend Polish (concurrent)

All UI built with shadcn/ui components.

| # | Task |
|---|------|
| B4.1 | Admin audit log viewer — shadcn Table + Select filters + date picker, pagination |
| B4.2 | React error boundaries around main content |
| B4.3 | Loading Skeletons for all data-fetching pages |
| B4.4 | Toast notifications for mutations |
| B4.5 | Empty states (no notes, no files, no results) |
| B4.6 | Responsive design pass — shadcn Sheet for mobile nav |
| B4.7 | Commit after each improvement |

#### REVIEW CHECKPOINT (Human)
- [ ] Every Route Handler has logging
- [ ] Permission denial appears in audit log
- [ ] 500 errors are logged
- [ ] Audit log viewer works

**Exit criteria:** Complete logging coverage. Frontend handles all error/loading/empty states.

---

### Phase 5: Seed Data + Deployment

**Duration:** ~3 hours  
**Agents:** 2 concurrent agents  
**Dependency:** Phase 4 complete

#### Agent A — Seed Script

| # | Task | GAPs Addressed |
|---|------|----------------|
| A5.1 | `scripts/seed.ts` — 10 users via `auth.admin.createUser({ email_confirm: true })` | GAP-21 |
| A5.2 | 4 organizations with overlapping memberships | — |
| A5.3 | ~10k notes with batch inserts, realistic titles, tags, visibility split | — |
| A5.4 | note_versions — ~30% get 2-5 versions with diffs | — |
| A5.5 | note_shares for 'shared' visibility notes | — |
| A5.6 | Files — create buckets, generate text files, upload, record metadata | GAP-24 |
| A5.7 | ai_summaries — 50-100 pre-generated, mixed statuses | — |
| A5.8 | Overlapping titles/tags across orgs | — |
| A5.9 | `scripts/reset-database.ts` | — |
| A5.10 | Run seed, verify < 60s, verify search at 10k scale | — |
| A5.11 | Commit | — |

#### Agent B — Deployment (concurrent)

| # | Task | GAPs Addressed |
|---|------|----------------|
| B5.1 | Dockerfile — multi-stage, `npm ci` (NOT `--only=production`), standalone | GAP-1 |
| B5.2 | `docker-compose.yml` — local testing | GAP-16 |
| B5.3 | `railway.toml` — build/start commands, health check | GAP-27 |
| B5.4 | Test Docker locally | — |
| B5.5 | `/api/health` Route Handler — 200 + DB connectivity check | — |
| B5.6 | Commit | — |

#### Human Tasks (after agents complete)
| # | Task |
|---|------|
| H5.1 | Railway: create project, connect GitHub repo |
| H5.2 | Railway: set environment variables |
| H5.3 | Push to GitHub, verify auto-deploy |
| H5.4 | End-to-end verification on production |
| H5.5 | Run seed against production Supabase |

#### REVIEW CHECKPOINT (Human)
- [ ] Login with seed credentials, verify isolation
- [ ] Search at 10k scale
- [ ] Railway logs visible
- [ ] Health check works

**Exit criteria:** Deployed on Railway, seeded, all features working in production.

---

### Phase 6: Documentation + Demo

**Duration:** ~2.5 hours  
**Agents:** 1 agent + Human  
**Dependency:** Phase 5 complete

#### Agent A — Documentation
| # | Task |
|---|------|
| A6.1 | Finalize NOTES.md |
| A6.2 | Generate ARCHITECTURE.md (bonus) |
| A6.3 | Polish README.md |

#### Human Tasks
| # | Task |
|---|------|
| H6.1 | Write AI_USAGE.md |
| H6.2 | Finalize BUGS.md (with commit SHAs) |
| H6.3 | Write REVIEW.md |
| H6.4 | Record 5-min demo video |
| H6.5 | Final walkthrough as new user |
| H6.6 | Verify git history tells coherent story |

**Exit criteria:** All deliverables complete. Video recorded. README tested from scratch.

---

### Concurrency Summary

```
TIME ──────────────────────────────────────────────────────────────────────►

Phase 0 (45min)   [1 Agent + Human]
                  ████████████████████

Phase 1 (3h)      [2 Agents in Parallel]
                  Agent A: DB migrations, RLS, triggers, auth API, org API
                  ████████████████████████████████████████████████████
                  Agent B: Providers, auth pages (shadcn), layout, org switcher, members
                  ████████████████████████████████████████████████████
                  Human review ████

Phase 2 (3.5h)    [2 Agents in Parallel]
                  Agent A: Notes CRUD routes, versioning, sharing, tags API
                  ██████████████████████████████████████████████████████████
                  Agent B: Note list, editor (shadcn), tags, visibility, share, versions, diff
                  ██████████████████████████████████████████████████████████
                  Human review ████

Phase 3 (3.5h)    [3 Agents in Parallel]
                  Agent A: Search route + AI integration (OpenRouter, Zod, rate limit)
                  ██████████████████████████████████████████████████████████
                  Agent B: File routes (upload, download, delete, storage)
                  ██████████████████████████████████████████████████████████
                  Agent C: Search UI + file UI + AI UI (all shadcn)
                  ██████████████████████████████████████████████████████████
                  Human review ████

Phase 4 (2.5h)    [2 Agents in Parallel]
                  Agent A: Audit all handlers, error wrapper, audit-logs API
                  ██████████████████████████████████████████████████
                  Agent B: Audit viewer (shadcn Table), error boundaries, loading, toasts
                  ██████████████████████████████████████████████████
                  Human review ███

Phase 5 (3h)      [2 Agents in Parallel]
                  Agent A: Seed script (10k notes, users, files, summaries)
                  ██████████████████████████████████████████████████████
                  Agent B: Dockerfile, docker-compose, railway.toml, health check
                  ██████████████████████████████████████████████████████
                  Human: Railway deploy + verification ██████

Phase 6 (2.5h)    [1 Agent + Human]
                  Agent A: NOTES.md, ARCHITECTURE.md, README
                  ██████████████████████████████
                  Human: AI_USAGE.md, BUGS.md, REVIEW.md, demo video
                  ██████████████████████████████████████████████████

TOTAL: ~19 hours wall-clock (leaves ~5 hours buffer from 24h limit)
```

### Dependency Graph

```
Phase 0 ─► Phase 1 ─► Phase 2 ─► Phase 3 ─► Phase 4 ─► Phase 5 ─► Phase 6
(setup)    (DB+auth)  (notes)    (search/    (logging/   (seed/      (docs/
                                  files/AI)   polish)     deploy)     video)

Within each phase:
  Agent A (backend) ──┐
  Agent B (frontend) ─┤── concurrent ──► Human review
  Agent C (if any) ───┘
```

### All 27 Gap Resolutions by Phase

| Gap | Phase | How |
|-----|-------|-----|
| GAP-1 (Dockerfile) | 5, B5.1 | `npm ci` not `--only=production` |
| GAP-2 (standalone) | 0, A0.2 | Set in next.config.ts |
| GAP-3 (hard delete) | 1, A1.1 | ON DELETE CASCADE |
| GAP-4 (git commits) | Cross-cutting | Every agent, every task |
| GAP-5 (NOTES.md) | Cross-cutting | Every action |
| GAP-6 (RLS all tables) | 1, A1.2 | Full policies, 9 tables |
| GAP-7 (rate limit) | 3, A3.5 | audit_logs count |
| GAP-9 (invite flow) | 1, B1.9 | Direct add by email |
| GAP-10 (model ID) | 3, A3.2 | Verify + fallback |
| GAP-11 (route order) | 0, A0.5 | search as sibling to [id] |
| GAP-12 (Zod) | 0+3 | Install + schema |
| GAP-13 (profile trigger) | 1, A1.3 | In 003 |
| GAP-14 (search trigger) | 1, A1.3 | In 003 |
| GAP-15 (bonus docs) | 6, A6.2 | Reclassified |
| GAP-16 (docker-compose) | 5, B5.2 | Included |
| GAP-17 (REVIEW.md) | 0, A0.11 | Template |
| GAP-18 (owner in RLS) | 1, A1.2 | `IN ('admin','owner')` |
| GAP-19 (admin SELECT) | 1, A1.2 | Override in notes_select |
| GAP-20 (@supabase/ssr) | 0, A0.3 | Installed |
| GAP-21 (email confirm) | 0 H0.2 + 5 A5.1 | Dashboard + admin API |
| GAP-22 (JWT not service) | 0 A0.8 + cross-cutting | createServerClient |
| GAP-23 (share boundary) | 2, A2.7 | App-level check |
| GAP-24 (seed files) | 5, A5.6 | Generate + upload |
| GAP-25 (x-org-id) | 1, B1.3 | TanStack Query headers |
| GAP-26 (failure logging) | 4, A4.1-A4.2 | Error wrapper |
| GAP-27 (agent-built deploy) | 5, B5.1-B5.3 | Dockerfile + railway.toml |
