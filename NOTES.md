# Agent Notes

A running scratchpad of plans, actions, decisions, and reasoning throughout the build.

---

## 2026-04-01 22:00 — Project Planning

**Plan:** Analyze the takehome requirements and create a comprehensive build plan.
**Reasoning:** Need to identify all requirements, gaps, and design decisions before writing code.
**Result:** Created detailed plan with 27 identified gaps, phased execution strategy with concurrent agents.
**Issues:** Node.js version needed upgrade from 18 to 22 for Next.js 16 compatibility.

## 2026-04-01 22:30 — Phase 0: Project Bootstrap

**Plan:** Initialize Next.js project, install all dependencies, set up folder skeleton, Supabase clients, types, logger, error handler.
**Reasoning:** Need a solid foundation with all infrastructure in place before feature work begins. Using shadcn/ui for consistent, accessible UI components.
**Result:** Project created with Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui (22 components), @supabase/ssr, @tanstack/react-query, zustand, zod, diff. Full folder skeleton with placeholder routes and pages. Three Supabase clients (browser, server with JWT, admin with service role). Audit logger, error wrapper, and API utilities created.
**Issues:** None.

## 2026-04-01 23:00 — Phase 1: Database + Auth Foundation

**Plan:** Two parallel agents — Agent A: SQL migrations, RLS policies, triggers, indexes, auth/org API routes. Agent B: Frontend auth pages, dashboard layout, org switcher, member management.
**Reasoning:** Backend and frontend are independent — they share a type contract but don't block each other.
**Result:** 9 tables created, RLS policies on all tables, profile creation + search vector triggers, full auth flow (signup/login/logout), org CRUD, member management.
**Issues:**
- Bug 1: RLS infinite recursion — org_memberships SELECT policy self-referenced. Fixed with SECURITY DEFINER helper functions (get_user_org_ids, user_has_org_role).
- Bug 2: Base UI DropdownMenuLabel requires DropdownMenuGroup wrapper (shadcn v4 uses Base UI, not Radix).
- Bug 3: Org creation chicken-and-egg — INSERT succeeds but chained .select() triggers SELECT policy before membership exists. Fixed by using admin client for initial org+membership creation.
- Bug 4: GET /api/orgs returned nested membership objects but frontend expected flat Organization[]. Fixed by flattening in the API.
- Bug 5: Stale activeOrgId in localStorage across user sessions. Fixed by clearing on logout.

## 2026-04-01 23:45 — Phase 2: Notes CRUD + Versioning + Tagging

**Plan:** Two parallel agents — Agent A: Notes CRUD routes, versioning, sharing, search, tag autocomplete. Agent B: Notes list, editor, tag input, share dialog, version history, diff viewer.
**Reasoning:** Same pattern as Phase 1 — backend routes and frontend UI built concurrently against shared type contract.
**Result:** Complete notes backend (CRUD, versioning, sharing, search, tags) and frontend (list page with card grid, detail/editor page, tag input with autocomplete, share dialog, version history with diff viewer). All routes use withAuth wrapper and audit logging.
**Issues:** Found and fixed: RLS circular recursion between notes↔note_shares (Bug 4), PopoverTrigger nativeButton warning (Bug 5), nested button hydration error in DialogTrigger (Bug 6), card layout inconsistency with/without tags.

## 2026-04-02 00:30 — Phase 3: Search + Files + AI

**Plan:** Three parallel agents — Agent A: Search + AI summary backend (OpenRouter, Zod validation, rate limiting). Agent B: File upload/download backend (Supabase Storage, signed URLs). Agent C: Search page, files page, AI summary component, file attachments UI.
**Reasoning:** Search, files, and AI are independent backend domains that can all be built simultaneously. Single frontend agent wires up all three UIs.
**Result:** Complete AI integration with OpenRouter (MiniMax-M2.7), Zod schema validation for structured output, rate limiting via audit_logs count, accept/reject with tag merging. File upload/download with Supabase Storage (signed URLs, admin client for storage ops, user client for DB with RLS). Search page with debounced input, files page with upload/download/delete, AI summary cards with generate/accept/reject.
**Issues:** Fixed: search results key mismatch (.results not .notes), file download URL key (.download_url), AI summary array parsing precedence bug, MIME type display, search infinite re-fetch (headers object ref in dep array), tags not updating after summary accept.

## 2026-04-02 01:15 — Phase 4: Logging + Polish + Error Handling

**Plan:** Two parallel agents — Agent A: Audit all route handlers for logging, add audit logs API. Agent B: Audit log viewer UI, error boundary, loading/empty states, responsive polish.
**Reasoning:** All features exist — now need operational visibility and production-ready UX.
**Result:** Audited all 22+ route handlers — confirmed logging on every mutation, auth event, AI request, and permission denial. Added structured console.error for Railway. Built audit logs API (filterable by action, user, date range, admin/owner only). Built full audit log viewer with color-coded action badges, filters, pagination. Added React ErrorBoundary wrapping dashboard content. Normalized audit action names to canonical format.
**Issues:** Fixed: hooks order violation (early return before useMemo), audit log flash for members, role select not disabled for non-owners, same-day date filter timezone issue.

## 2026-04-02 02:00 — Phase 5: Seed Data + Deployment

**Plan:** Two parallel agents — Agent A: Seed script (10k notes, 10 users, 4 orgs, files, AI summaries). Agent B: Dockerfile, docker-compose, railway.toml, image previews for files.
**Reasoning:** Seed and deployment are independent. Image previews requested by user.
**Result:** Seed script generates 10k notes across 4 orgs with overlapping tags/titles, 10 users with cross-org memberships, ~15k note versions, note shares, 20-30 files, 50-100 AI summaries. Dockerfile multi-stage build for ~150MB image. Railway config with health check. Image preview thumbnails in file list and attachments.
**Issues:** Pending seed run and Railway deployment.

## 2026-04-02 02:30 — Phase 6: Finalize Documentation

**Plan:** Replace boilerplate README with comprehensive project documentation. Create ARCHITECTURE.md with full schema, API reference, data flows, and security architecture. Finalize NOTES.md with all phases.
**Reasoning:** Documentation is a deliverable — the README is the first thing reviewers see, and ARCHITECTURE.md provides the deep technical reference. Both need to reflect the actual codebase accurately (verified against source files, migrations, and route handlers).
**Result:** README.md replaced with feature list, tech stack table, quick start, test credentials, env vars, scripts, architecture overview, and links to all deliverables. ARCHITECTURE.md created with directory structure, all 9 database tables with columns/constraints, 26 API endpoints with methods/paths/auth/descriptions, data flow diagrams for auth/notes/AI/files, three-layer security architecture, RLS policy summary, helper functions, triggers, and indexes. NOTES.md updated with Phase 6 entry.
**Issues:** None.
