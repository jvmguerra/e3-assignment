# Code Review Report

## What I Reviewed Deeply (every line)

### RLS Policies — `supabase/migrations/002_create_rls_policies.sql`
Tenant isolation is the most critical correctness requirement. I reviewed every policy across all 9 tables after each phase. Key findings:

- **Three rounds of recursion bugs** — Policies that reference other RLS-protected tables create circular dependencies. The agent produced this pattern three separate times. I enforced the `SECURITY DEFINER` helper function approach (`get_user_org_ids`, `user_has_org_role`, `user_can_access_note_org`, `user_is_shared_on_note`) to break all circular references.
- **Owner role omission** — Initial policies used `role = 'admin'` without including `'owner'`. Owners are supposed to have full control but were locked out of admin operations. Fixed to `role IN ('admin', 'owner')` everywhere.
- **Admin/owner visibility override** — The `notes_select` policy originally had no admin/owner override for private notes. An admin could UPDATE a private note (per the update policy) but couldn't SELECT it first — the update would silently affect 0 rows. Added the admin/owner bypass clause.
- **org_memberships INSERT bootstrap** — New orgs need a first membership (the owner), but the INSERT policy requires the caller to already be admin/owner of the org. Added the `NOT EXISTS` clause to allow the first membership when the org has no members yet.

### Route Handlers — All files in `src/app/api/`
Every route handler was reviewed for:

- **`withAuth` wrapper present** — Confirms authentication + org membership + permission logging on every request
- **Correct Supabase client** — `server.ts` (user JWT, RLS applies) for all route handlers. `admin.ts` (service role) ONLY in scripts, seed, org creation (chicken-and-egg), and storage operations. I verified no route handler accidentally uses the admin client for queries that should be RLS-protected.
- **Audit logging on every mutation** — 20+ distinct action types logged. Verified that every POST/PATCH/DELETE handler calls `auditLog()`.
- **Permission checks beyond RLS** — Role-based guards (e.g., only owner can change roles, only admin/owner can delete files they didn't upload, only admin/owner can view audit logs) are enforced in application code as defense-in-depth.

### Auth Middleware — `src/middleware.ts`
- Verified session refresh on every request via `@supabase/ssr` cookie handling
- Confirmed unauthenticated users are redirected to `/login` for all dashboard routes
- Confirmed authenticated users on `/login` or `/signup` are redirected to `/dashboard`
- Verified public paths (`/api/auth/*`, `/api/health`) are excluded from auth checks

### AI Integration — `src/lib/ai/openrouter.ts` + `src/app/api/ai/summary/route.ts`
- **Zod validation** — `SummarySchema.safeParse()` validates AI output before storing. Malformed responses are rejected, not stored.
- **Permission check before API call** — The note is fetched via the user's Supabase client (RLS applies) BEFORE sending content to OpenRouter. If the user can't see the note, the AI never sees it either.
- **Rate limiting** — Counts `ai.summary.requested` entries in `audit_logs` for the user in the last hour. Uses admin client for the count (since regular users can't SELECT audit_logs). Rejects at 10/hour.
- **No prompt injection path** — Note content is sent as a user message, not interpolated into the system prompt. The system prompt instructs JSON-only output.
- **Structured output validation** — Response is cleaned of markdown code fences, parsed as JSON, then validated against the Zod schema. Invalid structure → error to user, never stored.

### Seed Script — `scripts/seed.ts`
- Verified `auth.admin.createUser({ email_confirm: true })` bypasses email confirmation
- Verified overlapping tags and titles across orgs (critical for isolation testing)
- Verified visibility distribution (60/25/15) creates all three visibility types
- Verified batch insert performance (10k notes in ~39 seconds)

## What I Sampled

### UI Components
- Spot-checked shadcn/ui component usage for correct Base UI patterns (render props, trigger composition)
- Visual inspection of card layouts, responsive behavior, dark mode rendering
- Verified loading skeletons appear during data fetching
- Verified error toasts fire on failed operations
- Tested mobile layout: sidebar close on navigation, horizontal scroll on tables

### Frontend State Management
- Verified Zustand org store persists to localStorage and clears on logout/auth state change
- Verified TanStack Query cache invalidation on org switch (all queries refetch)
- Checked that tag filter, pagination, and search state reset appropriately on org switch

### Diff Viewer
- Tested line-level diff between version 1 and version 3 of a note
- Verified additions (green) and deletions (red) render correctly
- Checked that large diffs are scrollable

## What I Distrusted Most

### AI-Generated RLS Policies
**Justified.** The agent produced circular recursion three separate times. The pattern is subtle: a policy on table A queries table B, whose policy queries table A. PostgreSQL doesn't detect this at CREATE POLICY time — it only fails at query time with a cryptic `42P17 infinite recursion` error. This is the #1 risk area in the entire codebase.

**Mitigation applied:** All cross-table lookups in RLS policies go through `SECURITY DEFINER` helper functions that bypass RLS. This eliminates the recursion risk entirely. Any new table added to the system must follow this pattern.

### Supabase Client Selection (server.ts vs admin.ts)
**Justified.** Using the admin client in a route handler silently bypasses ALL RLS — tenant isolation, visibility controls, role-based access, everything. It's the single most dangerous mistake possible in this architecture. The agent used the correct client in most places, but the org creation route required admin (chicken-and-egg problem), and I had to verify every other route handler didn't accidentally follow that pattern.

**Mitigation applied:** `server.ts` has a code comment stating "NEVER use service role key in Route Handlers." The `withAuth` wrapper provides the user-scoped client, so handlers that use it correctly get RLS by default.

### useEffect Dependency Stability
**Justified.** Two separate infinite loop bugs caused by unstable references (TanStack Query returns new array/object references on every render). The `useApiHeaders()` hook returned a new object every render, and `data?.files ?? []` created a new array every render. Both caused useEffect to re-trigger endlessly.

**Mitigation applied:** Wrapped all derived arrays in `useMemo`. Replaced `headers` in useEffect dependencies with the underlying `activeOrgId` string. Established the pattern: never put TanStack Query data directly in useEffect deps.

### Base UI Component API
**Justified.** Four separate bugs from assuming Radix patterns (the agent's training data) when shadcn/ui v4 uses Base UI. The APIs look similar but differ in critical ways: `render` prop composition, trigger element requirements, context provider nesting.

**Mitigation applied:** Established rules documented in agent prompts: no nested buttons, use `buttonVariants` for Link styling, DropdownMenuLabel inside DropdownMenuGroup, controlled dialogs instead of DialogTrigger when wrapping children.

## What I'd Review Next With More Time

### Integration Tests with Multiple Users
Unit tests cover utilities and stores, but there are no end-to-end tests verifying that User A in Org X truly cannot access Org Y's data through the API. I'd add Playwright or supertest flows that:
- Create two users in different orgs
- Have User A attempt to access User B's notes via direct API calls with manipulated org headers
- Verify 403 responses and audit log entries

### Supabase Storage Policy Hardening
Storage operations currently use the admin client (bypasses storage-level policies). The `files` table has RLS, so the metadata is protected, but the actual file blobs in Supabase Storage rely on the admin client gatekeeper. I'd configure bucket-level storage policies in the Supabase dashboard to add a second layer of defense on the storage side.

### Rate Limiting Under Concurrency
The AI summary rate limit queries `audit_logs` for the user's recent requests. Under high concurrency, multiple requests could pass the check simultaneously before any of them write their audit log entry. I'd add a database-level advisory lock or move to a Redis-based counter for atomic rate limiting.

### Load Testing Search at Scale
Search works at 10k notes, but I haven't benchmarked it. The GIN index on `tsvector` should handle 100k+ notes, but I'd want to verify query plans and latency with `EXPLAIN ANALYZE` under realistic concurrent load.

### Markdown XSS Surface
The markdown renderer uses `react-markdown` with `remark-gfm` (no `rehype-raw` — removed after it caused render failures). While `react-markdown` sanitizes by default, the custom `[image:filename]` extension injects `src` attributes from signed URLs. I'd audit the URL construction to ensure no user-controlled input can escape into executable contexts.

### CSRF Protection
Authentication relies on Supabase's httpOnly cookie mechanism, which provides some CSRF protection. However, there's no explicit CSRF token validation on mutation endpoints. For a production deployment handling sensitive data, I'd add a double-submit cookie pattern or SameSite cookie enforcement.
