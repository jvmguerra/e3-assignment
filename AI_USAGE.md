# AI Usage Report

## Agents Used

- **Claude Code (Opus 4.6)** — Primary coding agent for all code generation, architecture decisions, debugging, and documentation
- **Parallel subagents** (Sonnet 4.6) — Specialized agent types used for concurrent work:
  - `backend-api-architect` — Database migrations, RLS policies, API route handlers, seed scripts
  - `staff-frontend-engineer` — React components, pages, shadcn/ui integration, UX
  - `general-purpose` — Documentation, code exploration, cross-cutting fixes

## Work Split

| Phase | Agents | Duration (with testing + debugging) | What ran in parallel |
|-------|--------|----------|---------------------|
| 0 — Setup | 1 main + 3 subagents | ~30 min | Types/clients, logger/API utils, folder skeleton |
| 1 — DB + Auth | 2 parallel | ~1 hrs | Backend (migrations, RLS, triggers, auth API) ‖ Frontend (auth pages, layout, org switcher) |
| 2 — Notes CRUD | 2 parallel | ~2 hrs | Backend (CRUD routes, versioning, sharing) ‖ Frontend (list, editor, tags, diff viewer) |
| 3 — Search/Files/AI | 3 parallel | ~2.5 hrs | Search+AI backend ‖ File upload backend ‖ All frontend UI |
| 4 — Logging + Polish | 2 parallel | ~1 hrs | Audit all handlers + logs API ‖ Audit log viewer + error boundaries |
| 5 — Seed + Deploy | 2 parallel | ~2 hrs | Seed script (10k notes) ‖ Dockerfile + Railway config |
| 6 — Docs | 1 agent | ~1 hr | README, ARCHITECTURE.md, NOTES.md finalization |
| Improvements | 3 parallel | ~1 hrs | Testing+CI ‖ UI fixes (dark mode, fonts, layout, stale org) ‖ Railway devex |
| Dashboard | 2 parallel | ~1.5 hrs | Stats/insight API ‖ Charts + page + components |

## Parallel Execution

The core architecture decision was splitting backend and frontend work into independent agents working against a shared type contract (`src/types/index.ts`). This worked because:

- Backend agents built API routes that returned typed JSON
- Frontend agents built UI components that consumed the same types
- Neither blocked the other — integration happened at each phase's review checkpoint

Phase 3 was the most aggressive parallelization: three agents simultaneously building search+AI, file management, and all frontend UI. This worked because the three backend domains (search, files, AI) had no shared state.

The tradeoff: agents occasionally produced mismatched response shapes (e.g., search API returned `results` but frontend expected `notes`). Every phase's manual review checkpoint caught these within minutes.

## Where Agents Were Wrong

### RLS Infinite Recursion — 3 separate incidents

The single most repeated failure. Each time the agent wrote an RLS policy that queried another RLS-protected table, creating a circular dependency:

1. **`org_memberships` self-reference** (commit 853e46a → fixed daaf6df) — The SELECT policy on `org_memberships` queried `org_memberships` to check if the user belongs to the org. PostgreSQL evaluated the subquery under the same policy → infinite loop.

2. **`notes` ↔ `note_shares` circular reference** (commit f9acacb → fixed 083b8d2) — `notes_select` checked `note_shares` for shared visibility. `note_shares_select` checked `notes` for org access. Each triggered the other's policy.

3. **Org creation chicken-and-egg** (commit 853e46a → fixed 532bfeb) — Insert org → chained `.select()` → SELECT policy requires membership → membership doesn't exist yet. Not recursion, but same RLS mental model failure.

**Root cause:** The agent treats RLS as simple row filters, but doesn't model the fact that subqueries in policies are themselves subject to RLS on the referenced tables. The fix was creating `SECURITY DEFINER` helper functions that bypass RLS for cross-table lookups.

### Base UI API Misunderstanding — 4 incidents

shadcn/ui v4 uses Base UI primitives (not Radix). The agent assumed Radix patterns:
- Nested `<button>` inside `<DialogTrigger>` (hydration error)
- `<span>` in `render` prop where `<button>` was required (nativeButton warning)
- `<Button render={<Link>}>` where `<Link>` renders `<a>`, not `<button>`
- `DropdownMenuLabel` outside `DropdownMenuGroup` (context missing error)

### Response Shape Mismatches — 3 incidents

Backend and frontend agents produced inconsistent contracts:
- Search API returned `.results`, frontend read `.notes`
- File download API returned `.download_url`, frontend read `.url` / `.signed_url`
- Org list API returned nested membership objects, frontend expected flat `Organization[]`

### useEffect Dependency Bugs — 2 incidents

- Search page: `useApiHeaders()` returns a new object each render → useEffect infinite loop
- Image preview: TanStack Query returns new `files` array reference each render → useEffect infinite loop

### Silent Render Failure — 1 incident

`rehype-raw` attempted to parse plain text as HTML. Characters like `<`, `>` in seeded notes broke the render tree silently — no error thrown, just empty output.

## Where I Intervened

Every phase had a manual review checkpoint. Key interventions:

- **RLS audit** — Read every policy line by line after Phase 1. Caught the recursion pattern and enforced the SECURITY DEFINER helper approach for all subsequent phases.
- **Cross-user login testing** — Logged in as different users and caught the stale org ID bug (Zustand persists to localStorage across sessions).
- **Audit log access control** — Caught a brief flash of data visible to non-admin users before the role check completed. Gated the query on role verification.
- **Member management permissions** — Caught that the role Select was interactive for members (should be disabled). Enforced UI-level permission gating matching the API-level checks.
- **Timezone handling** — Caught that same-day date filter returned no results due to UTC vs local timezone mismatch in audit log queries.
- **Mobile testing** — Found sidebar didn't close on navigation, close button overlapped org switcher, tables didn't scroll horizontally.
- **Font consistency** — Caught that browsers override `font-family` on form elements. Enforced global `font-family: inherit` rule.

## What I Don't Trust Agents To Do

### RLS Policies
Proved right three times. Complex boolean logic with cross-table references is where AI makes subtle errors that pass type checking but fail at runtime. Every RLS policy must be manually audited — there's no substitute.

### Supabase Client Selection
The distinction between `server.ts` (user JWT, RLS applies) and `admin.ts` (service role, bypasses RLS) is critical for security. The agent defaulted to the user client in places where it should have used admin (org creation) and could have done the reverse (which would silently bypass all tenant isolation). This must be verified manually for every route handler.

### Component Library API Patterns
shadcn/ui v4's switch from Radix to Base UI changed fundamental patterns (render props, trigger composition, context requirements). The agent's training data reflects the old Radix API. Every component usage needs manual verification against the actual installed version.

### Frontend/Backend Contract Alignment
Agents working in parallel inevitably produce mismatched response shapes. The type contract (`src/types/index.ts`) helps but doesn't cover API response wrappers. Manual integration testing at each phase boundary is essential.

### useEffect Dependencies
React's dependency rules are deceptively simple but agents consistently produce unstable references (new object/array each render) that cause infinite loops. Every useEffect with external data dependencies must be manually reviewed for referential stability.
