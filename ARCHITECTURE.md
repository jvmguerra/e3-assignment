# Architecture Reference

Technical architecture for the E3 Team Notes multi-tenant application.

---

## Directory Structure

```
e3/
├── src/
│   ├── app/
│   │   ├── (auth)/                  # Auth route group (no layout chrome)
│   │   │   ├── login/page.tsx       # Login page
│   │   │   └── signup/page.tsx      # Signup page
│   │   ├── (dashboard)/             # Dashboard route group (shared layout)
│   │   │   ├── layout.tsx           # Sidebar + org switcher + providers
│   │   │   ├── admin/
│   │   │   │   ├── audit-log/       # Audit log viewer (admin/owner only)
│   │   │   │   └── members/         # Member management page
│   │   │   ├── files/               # Org file browser with upload/download
│   │   │   ├── notes/               # Notes list (card grid)
│   │   │   │   └── [id]/            # Note detail/editor
│   │   │   │       └── versions/    # Version history + diff viewer
│   │   │   └── search/              # Full-text search page
│   │   ├── api/                     # Route handlers (see API Reference below)
│   │   ├── layout.tsx               # Root layout (html/body, fonts)
│   │   └── page.tsx                 # Landing → redirects to /notes
│   ├── components/
│   │   ├── files/                   # File-related components
│   │   ├── layout/
│   │   │   ├── error-boundary.tsx   # React error boundary
│   │   │   └── providers.tsx        # QueryClientProvider + theme
│   │   ├── notes/
│   │   │   ├── ai-summary.tsx       # AI summary card (generate/accept/reject)
│   │   │   ├── create-note-dialog.tsx
│   │   │   ├── diff-viewer.tsx      # Line-level diff between versions
│   │   │   ├── file-attachments.tsx # File attachments on a note
│   │   │   ├── share-dialog.tsx     # Per-user sharing dialog
│   │   │   └── tag-input.tsx        # Tag autocomplete input
│   │   ├── orgs/
│   │   │   ├── create-org-dialog.tsx
│   │   │   └── org-switcher.tsx     # Org selector dropdown
│   │   └── ui/                      # 22 shadcn/ui (Base UI) primitives
│   ├── hooks/
│   │   ├── use-api.ts               # TanStack Query hooks for all endpoints
│   │   └── use-auth.ts              # Auth state hook (login/signup/logout)
│   ├── lib/
│   │   ├── ai/
│   │   │   └── openrouter.ts        # OpenRouter client + Zod schema
│   │   ├── supabase/
│   │   │   ├── admin.ts             # Service-role client (server-only)
│   │   │   ├── client.ts            # Browser client
│   │   │   └── server.ts            # Server client (per-request, JWT-scoped)
│   │   ├── api-utils.ts             # withAuth wrapper, apiSuccess, apiError
│   │   ├── logger.ts                # Structured audit logger
│   │   └── utils.ts                 # cn() and general utilities
│   ├── stores/
│   │   └── org-store.ts             # Zustand store for active org ID
│   └── types/
│       └── index.ts                 # All TypeScript interfaces
├── supabase/
│   └── migrations/
│       ├── 001_create_tables.sql    # 9 tables
│       ├── 002_create_rls_policies.sql  # RLS policies + helper functions
│       ├── 003_create_triggers.sql  # Profile auto-create, search vector, updated_at
│       └── 004_create_indexes.sql   # GIN, B-tree, composite indexes
├── scripts/
│   ├── setup-database.ts            # Run migrations
│   ├── reset-database.ts            # Reset data (keeps schema)
│   ├── seed.ts                      # 10k notes, 10 users, 4 orgs
│   ├── check-policies.ts            # RLS policy verification
│   ├── check-notes-policies.ts      # Notes-specific RLS checks
│   └── fix-circular-rls.ts          # Utility for RLS recursion fix
├── Dockerfile                       # Multi-stage production build
├── .dockerignore                    # Excludes node_modules, .git, .env, test artifacts from Docker context
├── docker-compose.yml               # Local Docker setup
├── railway.toml                     # Railway deployment config
├── vitest.config.ts                 # Vitest test configuration
└── .github/
    └── workflows/
        └── ci.yml                   # GitHub Actions CI (lint, type-check, tests)
```

---

## Database Schema

### profiles
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, FK → auth.users(id) ON DELETE CASCADE |
| email | text | NOT NULL |
| display_name | text | nullable |
| avatar_url | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

### organizations
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| name | text | NOT NULL |
| slug | text | NOT NULL, UNIQUE |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

### org_memberships
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| user_id | uuid | NOT NULL, FK → profiles(id) CASCADE |
| org_id | uuid | NOT NULL, FK → organizations(id) CASCADE |
| role | text | NOT NULL, CHECK (owner/admin/member) |
| created_at | timestamptz | NOT NULL, default now() |

**Unique constraint:** (user_id, org_id)

### notes
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| org_id | uuid | NOT NULL, FK → organizations(id) CASCADE |
| created_by | uuid | NOT NULL, FK → profiles(id) CASCADE |
| title | text | NOT NULL, default '' |
| content | text | NOT NULL, default '' |
| visibility | text | NOT NULL, default 'private', CHECK (private/shared/public) |
| tags | text[] | NOT NULL, default '{}' |
| current_version | integer | NOT NULL, default 1 |
| search_vector | tsvector | Auto-maintained by trigger |
| created_at | timestamptz | NOT NULL, default now() |
| updated_at | timestamptz | NOT NULL, default now() |

### note_versions
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| note_id | uuid | NOT NULL, FK → notes(id) CASCADE |
| version_number | integer | NOT NULL |
| title | text | NOT NULL, default '' |
| content | text | NOT NULL, default '' |
| changed_by | uuid | NOT NULL, FK → profiles(id) CASCADE |
| change_summary | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

### note_shares
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| note_id | uuid | NOT NULL, FK → notes(id) CASCADE |
| user_id | uuid | NOT NULL, FK → profiles(id) CASCADE |
| created_at | timestamptz | NOT NULL, default now() |

**Unique constraint:** (note_id, user_id)

### files
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| org_id | uuid | NOT NULL, FK → organizations(id) CASCADE |
| note_id | uuid | nullable, FK → notes(id) SET NULL |
| uploaded_by | uuid | NOT NULL, FK → profiles(id) CASCADE |
| file_name | text | NOT NULL |
| file_path | text | NOT NULL |
| file_size | bigint | NOT NULL, default 0 |
| mime_type | text | NOT NULL, default '' |
| created_at | timestamptz | NOT NULL, default now() |

### ai_summaries
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| note_id | uuid | NOT NULL, FK → notes(id) CASCADE |
| version_number | integer | NOT NULL |
| summary | jsonb | NOT NULL, default '{}' |
| status | text | NOT NULL, default 'pending', CHECK (pending/accepted/rejected) |
| generated_at | timestamptz | NOT NULL, default now() |
| accepted_at | timestamptz | nullable |
| accepted_by | uuid | nullable, FK → profiles(id) SET NULL |

**Summary JSONB structure:**
```json
{
  "overview": "string",
  "key_points": ["string"],
  "action_items": ["string"],
  "tags_suggested": ["string"]
}
```

### audit_logs
| Column | Type | Constraints |
|--------|------|-------------|
| id | uuid | PK, default gen_random_uuid() |
| org_id | uuid | NOT NULL, FK → organizations(id) CASCADE |
| user_id | uuid | NOT NULL, FK → profiles(id) CASCADE |
| action | text | NOT NULL |
| resource_type | text | nullable |
| resource_id | uuid | nullable |
| metadata | jsonb | NOT NULL, default '{}' |
| ip_address | text | nullable |
| created_at | timestamptz | NOT NULL, default now() |

---

## API Endpoint Reference

All endpoints under `/api/` except auth and health require authentication via Supabase JWT.
Org-scoped endpoints read the active org from the `x-org-id` header.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | No | Create account (email + password) |
| POST | `/api/auth/login` | No | Login, returns session |
| POST | `/api/auth/logout` | No | Destroy session |

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check (returns status, uptime, latency, version, environment) |

### Organizations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orgs` | Yes | List user's organizations |
| POST | `/api/orgs` | Yes | Create organization (user becomes owner) |

### Members

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orgs/[id]/members` | Yes | List org members with roles |

### Notes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notes` | Yes | List notes in active org (paginated) |
| POST | `/api/notes` | Yes | Create note |
| GET | `/api/notes/[id]` | Yes | Get single note with creator + shares |
| PATCH | `/api/notes/[id]` | Yes | Update note (creates version snapshot) |
| DELETE | `/api/notes/[id]` | Yes | Delete note (owner/admin or creator) |
| GET | `/api/notes/search` | Yes | Full-text search (tsvector) |
| GET | `/api/notes/tags` | Yes | Tag autocomplete for org |

### Versions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notes/[id]/versions` | Yes | List all versions of a note |

### Sharing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notes/[id]/share` | Yes | List share records for a note |
| POST | `/api/notes/[id]/share` | Yes | Share note with user(s) |
| DELETE | `/api/notes/[id]/share` | Yes | Remove share(s) from note |

### Files

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/files` | Yes | List files in org (optionally by note_id) |
| POST | `/api/files` | Yes | Upload file to Supabase Storage |
| GET | `/api/files/[id]` | Yes | Get signed download URL |
| DELETE | `/api/files/[id]` | Yes | Delete file from storage + DB |

### AI Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai/summary` | Yes | Get summaries for a note |
| POST | `/api/ai/summary` | Yes | Generate AI summary (OpenRouter) |
| PATCH | `/api/ai/summary` | Yes | Accept or reject summary |

### Audit Logs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit-logs` | Yes (admin/owner) | List audit logs (filterable) |

---

## Data Flow

### Authentication Flow
```
Browser → POST /api/auth/login → Supabase Auth → JWT cookie set
  → All subsequent requests include JWT automatically
  → Middleware checks JWT on every /(dashboard)/ route
  → Route handlers extract user via supabase.auth.getUser()
```

### Note Creation Flow
```
Browser → POST /api/notes { title, content, tags, visibility }
  → withAuth: verify JWT, extract user + orgId
  → Check org membership
  → INSERT note (RLS: org_id must match user's orgs, created_by = auth.uid())
  → INSERT note_version (version 1 snapshot)
  → Audit log: note.created
  → Return note
```

### AI Summary Flow
```
Browser → POST /api/ai/summary { noteId }
  → withAuth: verify JWT, extract user + orgId
  → Fetch note content from DB
  → Rate limit check (audit_logs count in last hour)
  → POST to OpenRouter (MiniMax-M2.7) with structured prompt
  → Zod-validate response schema
  → INSERT ai_summary (status: pending)
  → Audit log: ai.summary.generated
  → Return summary

Browser → PATCH /api/ai/summary { summaryId, action: accept|reject }
  → If accept: merge suggested tags into note.tags
  → UPDATE ai_summary status + accepted_at/accepted_by
  → Audit log: ai.summary.accepted or ai.summary.rejected
```

### File Upload Flow
```
Browser → POST /api/files (FormData: file + noteId?)
  → withAuth: verify JWT, extract user + orgId
  → Upload to Supabase Storage via admin client (bypasses storage RLS)
  → INSERT file record via user client (respects DB RLS)
  → Audit log: file.uploaded
  → Return file record

Browser → GET /api/files/[id]
  → Fetch file record, generate signed URL (60s expiry)
  → Return { download_url }
```

---

## Security Architecture

### Three-Layer Defense-in-Depth

```
Layer 1: Middleware (src/middleware.ts)
├── Runs on every request to /(dashboard)/ routes
├── Checks for valid Supabase session
└── Redirects to /login if unauthenticated

Layer 2: Route Handler (withAuth wrapper)
├── Extracts user from JWT
├── Reads x-org-id header
├── Verifies user is a member of the requested org
├── Provides membership role for permission checks
└── Returns 401/403 before any DB query

Layer 3: Supabase RLS (PostgreSQL)
├── Every table has RLS enabled
├── Policies use SECURITY DEFINER helpers to avoid recursion
├── Even if Layer 1+2 are bypassed, RLS prevents cross-tenant reads
└── Audit logs: admin/owner SELECT only, INSERT via function only
```

### RLS Policy Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | All authenticated | — | Own only | — |
| organizations | Member orgs only | Any authenticated | — | — |
| org_memberships | Member orgs only | Owner/admin (or first member) | Owner/admin | Owner/admin |
| notes | Org member + visibility rules | Org member, self as creator | Creator or owner/admin | Creator or owner/admin |
| note_versions | Via note org membership | Org member of note | — | — |
| note_shares | Via note org membership | Note creator or owner/admin | — | Note creator or owner/admin |
| files | Org member | Org member, self as uploader | — | Uploader or owner/admin |
| ai_summaries | Via note org membership | Org member of note | Org member of note | — |
| audit_logs | Admin/owner only | Via insert_audit_log() function | — | — |

### Helper Functions (SECURITY DEFINER)

| Function | Purpose |
|----------|---------|
| `get_user_org_ids(user_id)` | Returns all org IDs for a user (breaks org_memberships recursion) |
| `user_has_org_role(user_id, org_id, roles[])` | Checks if user has any of the given roles in an org |
| `user_can_access_note_org(user_id, note_id)` | Checks if user is a member of the note's org |
| `user_is_shared_on_note(user_id, note_id)` | Checks if user has a share record on a note |
| `insert_audit_log(...)` | Inserts audit log row (users have no direct INSERT policy) |

---

## Database Triggers

| Trigger | Table | Event | Purpose |
|---------|-------|-------|---------|
| `on_auth_user_created` | auth.users | AFTER INSERT | Auto-create profile row |
| `notes_search_vector_update` | notes | BEFORE INSERT/UPDATE | Maintain tsvector (title=A, content=B, tags=C) |
| `organizations_updated_at` | organizations | BEFORE UPDATE | Set updated_at = now() |
| `notes_updated_at` | notes | BEFORE UPDATE | Set updated_at = now() |

## Indexes

| Index | Table | Type | Purpose |
|-------|-------|------|---------|
| `idx_notes_search_vector` | notes | GIN | Full-text search |
| `idx_notes_tags` | notes | GIN | Tag filtering |
| `idx_notes_org_id` | notes | B-tree | List by org |
| `idx_notes_created_by` | notes | B-tree | List by creator |
| `idx_org_memberships_user_id` | org_memberships | B-tree | User lookup |
| `idx_org_memberships_org_id` | org_memberships | B-tree | Org lookup |
| `idx_org_memberships_user_org` | org_memberships | UNIQUE | One membership per user per org |
| `idx_note_versions_note_id` | note_versions | B-tree | Version history |
| `idx_files_org_id` | files | B-tree | Files by org |
| `idx_files_note_id` | files | B-tree | Files by note |
| `idx_audit_logs_org_id` | audit_logs | B-tree | Audit log by org |
| `idx_audit_logs_created_at` | audit_logs | B-tree | Time-range scans |
| `idx_ai_summaries_note_id` | ai_summaries | B-tree | Summaries by note |

---

## Frontend: Markdown Rendering

Notes render Markdown content using **react-markdown** with the **remark-gfm** plugin for GitHub Flavored Markdown (tables, strikethrough, task lists, autolinks).

### Custom Extensions

Two custom syntaxes are handled via pre-processing before the Markdown renderer:

- **Warning blocks:** `[warn]text[/warn]` — Content is split at warning tags and rendered as highlighted warning panels between standard Markdown sections.
- **Inline images:** `[image:filename.png]` — Converted to standard Markdown image syntax pointing to the note's file attachments (signed URLs).

`rehype-raw` was initially included but removed because it silently broke rendering when note content contained characters like `<`, `>`, or `&` (see Bug 10 in BUGS.md).

---

## Testing

### Vitest Configuration

Tests use **Vitest** configured in `vitest.config.ts` with path aliases matching the Next.js `tsconfig.json`. Tests are co-located alongside source files or in `__tests__` directories.

### Test Coverage

21 unit tests covering:
- Utility functions (`cn()`, date formatting, slug generation)
- API helper functions (`apiSuccess`, `apiError`, `withAuth` behavior)
- Store logic (Zustand org store)
- Component rendering and interaction

### Running Tests

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |

---

## CI/CD

### GitHub Actions

The CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request:
1. Checkout + Node.js 22 setup
2. `npm ci` (clean install)
3. `npm run lint` (ESLint)
4. `npm run type-check` (TypeScript)
5. `npm test` (Vitest)

### Husky Git Hooks

- **pre-commit:** Runs ESLint on staged files via lint-staged.
- **pre-push:** Runs `npm run type-check && npm test` to prevent broken code from reaching the remote. Hooks source nvm to ensure Node 22 is available.
