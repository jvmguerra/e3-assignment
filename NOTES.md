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
**Issues:** None so far — pending human review.
