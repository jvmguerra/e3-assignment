# E3 Team Notes — Multi-Tenant Notes App

A full-stack multi-tenant team notes application built with Next.js 16, Supabase, and AI-powered summaries.

## Features

- **Multi-tenancy** — Users belong to multiple organizations with role-based access (owner/admin/member)
- **Notes CRUD** — Create, edit, delete notes with tagging, visibility controls (private/shared/public), and selective sharing
- **Versioning** — Full version history with line-level diffs between any two versions
- **Search** — Full-text search across titles, content, and tags using PostgreSQL tsvector (tested at 10k notes)
- **File Upload** — Upload files to orgs/notes with signed download URLs and image previews
- **AI Summary** — Generate structured summaries per note via MiniMax-M2.7 (OpenRouter), with accept/reject workflow
- **Audit Logging** — Complete operational visibility into auth events, mutations, AI requests, failures, and permission denials
- **Tenant Isolation** — Three-layer defense: middleware → route handler → RLS. Every query, mutation, upload, and AI call is org-scoped
- **Markdown Rendering** — Notes render with full Markdown support (bold, italic, code, tables, blockquotes, GFM) plus custom extensions for warning blocks and inline image references
- **Dark Mode** — System-aware dark mode with manual toggle in the sidebar
- **Numeric Pagination** — Page numbers with jump-to-page across all paginated views
- **Dashboard** — Real-time org overview with stat cards, TradingView lightweight-charts (area + histogram), top tags, top contributors, and AI-generated insights

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (Base UI) |
| State | TanStack Query (server), Zustand (client — active org) |
| Backend | Next.js Route Handlers, Supabase PostgreSQL + RLS |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage (signed URLs) |
| AI | MiniMax-M2.7 via OpenRouter, Zod validation |
| Deployment | Docker (multi-stage), Railway |

## Quick Start

```bash
git clone git@github.com:jvmguerra/e3-assignment.git
cd e3-assignment
cp .env.example .env
# Fill in .env with your Supabase and OpenRouter keys
nvm use 22  # or ensure Node >= 22
npm install
npm run db:setup   # Run migrations (requires DATABASE_URL)
npm run seed       # Seed 10k notes, 10 users, 4 orgs
npm run dev        # Start at http://localhost:3000
```

## Test Credentials

| Email | Password | Roles |
|-------|----------|-------|
| alice@test.com | password123 | Owner @ Acme Corp, Member @ Startup Labs |
| bob@test.com | password123 | Admin @ Acme Corp, Owner @ Research Group |
| charlie@test.com | password123 | Member @ Acme Corp, Admin @ Startup Labs |
| diana@test.com | password123 | Owner @ Startup Labs, Member @ Research Group |

## Environment Variables

See `.env.example` for the full list. Required:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — Supabase anon/publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)
- `OPENROUTER_API_KEY` — OpenRouter API key for AI summaries
- `MINIMAX_MODEL` — AI model ID (default: `minimax/minimax-m2.7`)
- `DATABASE_URL` — PostgreSQL connection string (for migrations/seed only)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:setup` | Run SQL migrations |
| `npm run db:reset` | Reset all data (keeps schema) |
| `npm run seed` | Seed 10k notes + test data |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript type checking |
| `npm test` | Run Vitest unit tests (21 tests) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run docker:build` | Build production Docker image |
| `npm run docker:run` | Run Docker container locally |

## Markdown Syntax

Notes support full Markdown rendering via react-markdown + remark-gfm, plus custom extensions.

### Standard Markdown

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `inline code` `` | `inline code` |
| ` ``` code block ``` ` | Fenced code block |
| `> blockquote` | Blockquote |
| `- item` / `1. item` | Unordered / ordered list |
| `\| col \| col \|` | Table (GFM) |
| `[text](url)` | Link |
| `---` | Horizontal rule |

### Custom Extensions

| Syntax | Result |
|--------|--------|
| `[warn]text[/warn]` | Warning block with highlighted background |
| `[image:filename.png]` | Inline image rendered from the note's file attachments |

## Testing

- **Unit tests:** `npm test` runs 21 Vitest unit tests covering utilities, API helpers, and component logic.
- **Pre-commit hook (Husky):** Runs ESLint on staged files before every commit.
- **Pre-push hook (Husky):** Runs type-check + full test suite before every push.
- **CI:** GitHub Actions workflow runs lint, type-check, and tests on every push and PR.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical architecture.

### Defense-in-Depth Security

```
Request → Middleware (auth check) → Route Handler (org membership + permissions) → Supabase RLS (row-level)
```

Three independent layers ensure tenant isolation. If any one fails, the others catch it.

### RLS Strategy

All policies use `SECURITY DEFINER` helper functions to avoid circular recursion:
- `get_user_org_ids()` — returns org IDs the user belongs to
- `user_has_org_role()` — checks if user has specific roles in an org
- `user_can_access_note_org()` — checks note's org membership
- `user_is_shared_on_note()` — checks note share records

## Deliverables

- [NOTES.md](NOTES.md) — Real-time agent scratchpad throughout the build
- [AI_USAGE.md](AI_USAGE.md) — Agent strategy, work split, interventions
- [BUGS.md](BUGS.md) — Bugs found during review with commit references
- [REVIEW.md](REVIEW.md) — Review strategy and findings
- [ARCHITECTURE.md](ARCHITECTURE.md) — Technical architecture reference
