/**
 * seed.ts
 *
 * Populates the database with realistic test data:
 *   - 10 users with auth accounts and profiles
 *   - 4 organizations
 *   - ~10,000 notes with tags, visibility, and realistic content
 *   - ~30% of notes get 2-5 versions
 *   - note_shares for shared notes
 *   - 20-30 files uploaded to storage
 *   - 50-100 AI summaries
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const TAG_POOL = [
  'planning', 'engineering', 'design', 'marketing', 'sales', 'hr', 'finance',
  'ops', 'security', 'devops', 'frontend', 'backend', 'api', 'database',
  'testing', 'deployment', 'monitoring', 'documentation', 'architecture',
  'performance', 'bug', 'feature', 'refactor', 'review', 'meeting', 'standup',
  'retrospective', 'sprint', 'milestone', 'release', 'onboarding', 'training',
  'policy', 'compliance', 'research', 'prototype', 'mvp', 'launch', 'feedback',
  'analytics',
];

const TITLE_TEMPLATES = [
  'Q1 Planning Meeting Notes',
  'Q2 Planning Meeting Notes',
  'Q3 Planning Meeting Notes',
  'Q4 Planning Meeting Notes',
  'API Integration Guide',
  'Bug Fix: Login Timeout',
  'Bug Fix: Session Expiry',
  'Bug Fix: Data Race Condition',
  'Weekly Standup Summary',
  'Product Roadmap 2026',
  'Product Roadmap 2027',
  'Architecture Decision: Microservices vs Monolith',
  'Architecture Decision: GraphQL vs REST',
  'Architecture Decision: Event Sourcing',
  'Database Schema Review',
  'Security Audit Findings',
  'Sprint 12 Retrospective',
  'Sprint 13 Retrospective',
  'Sprint 14 Retrospective',
  'Onboarding Checklist for New Engineers',
  'Deployment Runbook: Production',
  'Deployment Runbook: Staging',
  'Frontend Component Library Guidelines',
  'Backend Service Documentation',
  'Data Pipeline Design',
  'CI/CD Pipeline Setup',
  'Incident Post-Mortem: Outage 2026-01-15',
  'Incident Post-Mortem: Slow Queries',
  'Performance Benchmarking Results',
  'User Research Findings: Q1',
  'User Research Findings: Q2',
  'Feature Spec: Dashboard Redesign',
  'Feature Spec: Notification System',
  'Feature Spec: Multi-Tenant Auth',
  'Feature Spec: Export to CSV',
  'Code Review Guidelines',
  'Release Notes: v2.1.0',
  'Release Notes: v2.2.0',
  'Release Notes: v3.0.0',
  'Marketing Campaign Brief: Spring',
  'Marketing Campaign Brief: Fall',
  'Sales Strategy: Enterprise Tier',
  'Sales Strategy: SMB Tier',
  'HR Policy Update: Remote Work',
  'HR Policy Update: PTO',
  'Finance Report: Monthly Burn Rate',
  'Finance Report: Q1 Revenue',
  'Compliance Checklist: SOC2',
  'Compliance Checklist: GDPR',
  'Monitoring Alerts Configuration',
  'Observability Stack Setup',
  'Testing Strategy: E2E',
  'Testing Strategy: Unit Tests',
  'Refactor Plan: Auth Module',
  'Refactor Plan: API Layer',
  'Team Capacity Planning: Q2',
  'Team Capacity Planning: Q3',
  'Vendor Evaluation: AWS vs GCP',
  'Vendor Evaluation: Auth Providers',
  'Design System Tokens Reference',
  'Accessibility Audit Report',
  'Mobile App Architecture Notes',
  'WebSocket Integration Notes',
  'Rate Limiting Strategy',
  'Caching Strategy: Redis vs Memcached',
  'Search Implementation: Full-Text',
  'Search Implementation: Semantic',
  'Analytics Dashboard Spec',
  'KPI Review: Engineering',
  'KPI Review: Sales',
  'OKR Planning: Engineering Team',
  'OKR Planning: Product Team',
  'API Versioning Policy',
  'Error Handling Standards',
  'Logging Standards',
  'Data Retention Policy',
  'Backup and Recovery Plan',
  'Disaster Recovery Runbook',
  'On-Call Rotation Guidelines',
  'Escalation Policy',
  'Interview Process Update',
  'Engineering Hiring Plan 2026',
  'Product Vision Document',
  'Competitive Analysis: Q1',
  'Competitive Analysis: Q2',
  'Customer Feedback Summary: March',
  'Customer Feedback Summary: April',
  'Integration Spec: Slack',
  'Integration Spec: GitHub',
  'Integration Spec: Jira',
  'Prototype: AI Summary Feature',
  'Prototype: Real-Time Collab',
  'MVP Scope: Phase 1',
  'MVP Scope: Phase 2',
  'Launch Checklist: Beta',
  'Launch Checklist: GA',
  'Post-Launch Review: Beta',
  'Weekly Engineering All-Hands',
  'Monthly Metrics Review',
  'Infrastructure Cost Analysis',
  'Technical Debt Inventory',
  'Dependency Upgrade Plan',
];

// Domain-specific paragraph templates — indexed by rough topic
const PARA_TEMPLATES = [
  // Engineering
  'The team reviewed the current API response times and identified three endpoints with P99 latency above 800ms. The root cause was traced to N+1 query patterns introduced in the previous sprint. A follow-up ticket has been created to add eager loading and a Redis cache layer.',
  'During the architecture discussion, the group aligned on moving session state to a dedicated Redis cluster rather than in-memory storage. This eliminates the stickiness requirement on the load balancer and enables zero-downtime rolling deployments without session loss.',
  'The deployment pipeline was updated to run integration tests in parallel across four workers. Total CI duration dropped from 22 minutes to 9 minutes. Flaky tests in the file-upload suite were quarantined pending a fix in the next sprint.',
  'Code coverage for the authentication module increased from 61% to 84% after the refactor. The new boundary tests caught two edge cases around token refresh that were silently failing in production for accounts with expired OAuth grants.',
  'We agreed to adopt OpenTelemetry as the standard instrumentation library across all services. Traces will be exported to Grafana Tempo and correlated with logs in Loki. The first service migration is planned for next sprint.',
  // Product / Planning
  'The product roadmap for Q3 was reviewed with stakeholders. The top three priorities are: (1) the notification system redesign, (2) the CSV export feature for enterprise customers, and (3) performance improvements to the main dashboard query.',
  'User research sessions conducted in March surfaced a consistent pain point: users cannot easily find notes shared with them across multiple organizations. The proposed solution is a global shared-with-me inbox sorted by recent activity.',
  'The sprint retrospective highlighted communication gaps between design and engineering during the handoff phase. Going forward, design will participate in sprint planning to flag implementation risks before tickets are pointed.',
  'The MVP scope for Phase 2 was finalized. Out-of-scope items include real-time collaborative editing and offline mode, which are deferred to Phase 3 based on customer priority data.',
  'Customer feedback from the beta cohort indicates that the tagging system is the most-used organizational feature. The top request is the ability to create tag hierarchies and filter by multiple tags simultaneously.',
  // Security / Compliance
  'The security audit identified two medium-severity findings: (1) missing Content-Security-Policy headers on API responses, and (2) verbose error messages leaking internal stack traces in 500 responses. Both have been patched and verified in the staging environment.',
  'GDPR compliance review confirmed that all personal data is stored in the EU-West-1 region. Data retention policies have been updated to automatically purge user records 90 days after account deletion requests are processed.',
  'The SOC 2 Type II audit preparation is on track. Evidence collection for the access control and change management criteria is complete. The vendor questionnaire for the third-party sub-processors was sent to legal for review.',
  'Penetration test results from the external firm were reviewed. No critical findings were identified. The two high-severity items—an IDOR vulnerability in the file download endpoint and a missing rate limit on the password reset flow—have been remediated.',
  // DevOps / Infrastructure
  'The Kubernetes cluster was upgraded from 1.28 to 1.30. The rollout completed with zero downtime using a blue-green strategy across all three availability zones. Node pool autoscaler thresholds were tuned to reduce over-provisioning costs by an estimated 18%.',
  'Terraform modules for the new staging environment are complete and peer-reviewed. The infrastructure is now fully reproducible from code. Secrets are managed via Vault dynamic credentials rather than static environment variables.',
  'Database backup verification ran successfully. Restores were tested in the isolated recovery environment and completed in under 12 minutes for the largest database (410 GB). The RTO target of 30 minutes is comfortably met.',
  'Alert fatigue has been reduced by consolidating 47 individual PagerDuty rules into 12 composite conditions. The on-call rotation report for February showed a 34% drop in non-actionable pages compared to January.',
  // Marketing / Sales
  'The spring campaign delivered a 23% increase in trial sign-ups compared to the same period last year. Email open rates averaged 31%, above the industry benchmark of 21%. The highest-performing subject line was "Your team\'s notes, finally organized."',
  'The enterprise sales pilot with three Fortune 500 accounts concluded last quarter. Two accounts converted to annual contracts. The third requested a custom SLA and dedicated support tier, which the sales team is evaluating.',
  'The competitive analysis update identified two new entrants in the SMB segment offering feature-comparable products at 40% lower price points. The recommendation is to accelerate the enterprise tier differentiation rather than compete on price.',
  // HR / Finance
  'The engineering hiring plan for 2026 was approved. Headcount additions include two senior backend engineers, one staff infrastructure engineer, and one engineering manager. Sourcing will begin in Q2 with a target start date of Q3.',
  'Monthly burn rate for March came in at $312K, $8K under budget. The variance is primarily due to delayed hardware procurement. Forecasts have been revised upward for Q3 based on planned headcount growth.',
  'The remote work policy update was ratified by the leadership team. Key changes: the core collaboration hours window is now 10am–3pm local time for all employees, and quarterly in-person gatherings are required for teams distributed across more than two time zones.',
  // Research / Prototyping
  'The prototype for the AI summary feature was demoed to the product team. Accuracy on engineering notes was rated 4.2/5 on average. The model struggled with highly technical notes containing code snippets, which will require a specialized prompt tuning pass.',
  'The semantic search proof-of-concept showed 87% recall at rank-5 for a curated test set of 500 queries. The embedding model latency was acceptable at 45ms P99. The team agreed to move forward with a production spike in Q2.',
  'Load testing the new notes search endpoint with 10,000 concurrent users showed response times staying below 250ms at P95. The bottleneck shifted from the database to the full-text ranking computation, which will be offloaded to a dedicated worker pool.',
];

// Change summary templates for note versions
const CHANGE_SUMMARIES = [
  'Clarified implementation details',
  'Added action items from follow-up discussion',
  'Fixed typos and improved formatting',
  'Updated based on stakeholder feedback',
  'Added performance metrics',
  'Revised timeline estimates',
  'Incorporated security review comments',
  'Updated technical specifications',
  'Added rollback procedure',
  'Expanded risk assessment section',
  'Corrected inaccurate data points',
  'Added links to related tickets',
  'Simplified language for broader audience',
  'Added diagrams and architecture notes',
  'Merged feedback from async review',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): string {
  const ms = Date.now() - Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(ms).toISOString();
}

function buildNoteContent(): string {
  const count = randomInt(2, 5);
  return pickN(PARA_TEMPLATES, count).join('\n\n');
}

async function batchInsert(table: string, rows: object[], chunkSize = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
    process.stdout.write(`  ${table}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// User definitions
// ---------------------------------------------------------------------------

interface UserDef {
  email: string;
  displayName: string;
  id?: string;
}

const USERS: UserDef[] = [
  { email: 'alice@test.com',   displayName: 'Alice Anderson' },
  { email: 'bob@test.com',     displayName: 'Bob Baker' },
  { email: 'charlie@test.com', displayName: 'Charlie Chen' },
  { email: 'diana@test.com',   displayName: 'Diana Davis' },
  { email: 'eve@test.com',     displayName: 'Eve Evans' },
  { email: 'frank@test.com',   displayName: 'Frank Foster' },
  { email: 'grace@test.com',   displayName: 'Grace Green' },
  { email: 'henry@test.com',   displayName: 'Henry Harris' },
  { email: 'iris@test.com',    displayName: 'Iris Ingram' },
  { email: 'jack@test.com',    displayName: 'Jack Johnson' },
];

// ---------------------------------------------------------------------------
// Organization definitions
// ---------------------------------------------------------------------------

interface OrgDef {
  name: string;
  slug: string;
  noteCount: number;
  id?: string;
  // members: [email, role]
  members: Array<{ email: string; role: 'owner' | 'admin' | 'member' }>;
}

const ORGS: OrgDef[] = [
  {
    name: 'Acme Corp',
    slug: 'acme-corp',
    noteCount: 4000,
    members: [
      { email: 'alice@test.com',   role: 'owner'  },
      { email: 'bob@test.com',     role: 'admin'  },
      { email: 'charlie@test.com', role: 'member' },
      { email: 'frank@test.com',   role: 'member' },
      { email: 'henry@test.com',   role: 'member' },
      { email: 'jack@test.com',    role: 'member' },
    ],
  },
  {
    name: 'Startup Labs',
    slug: 'startup-labs',
    noteCount: 3000,
    members: [
      { email: 'diana@test.com',   role: 'owner'  },
      { email: 'charlie@test.com', role: 'admin'  },
      { email: 'alice@test.com',   role: 'member' },
      { email: 'eve@test.com',     role: 'member' },
      { email: 'henry@test.com',   role: 'member' },
    ],
  },
  {
    name: 'Research Group',
    slug: 'research-group',
    noteCount: 2000,
    members: [
      { email: 'bob@test.com',     role: 'owner'  },
      { email: 'frank@test.com',   role: 'admin'  },
      { email: 'diana@test.com',   role: 'member' },
      { email: 'grace@test.com',   role: 'member' },
      { email: 'iris@test.com',    role: 'member' },
    ],
  },
  {
    name: 'Solo Ventures',
    slug: 'solo-ventures',
    noteCount: 1000,
    members: [
      { email: 'grace@test.com',   role: 'owner'  },
      { email: 'eve@test.com',     role: 'member' },
      { email: 'iris@test.com',    role: 'member' },
      { email: 'jack@test.com',    role: 'member' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.time('Seed complete');

  // ------------------------------------------------------------------
  // 1. Create auth users
  // ------------------------------------------------------------------
  console.log('\n[1/9] Creating auth users...');
  for (const user of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: 'password123',
      email_confirm: true,
    });
    if (error) {
      // Tolerate "already exists" errors so the script is idempotent-ish
      if (error.message.includes('already been registered')) {
        // Look up existing user id
        const { data: existing } = await supabase.auth.admin.listUsers();
        const found = existing?.users.find(u => u.email === user.email);
        if (found) user.id = found.id;
        console.log(`  User ${user.email} already exists, using id ${user.id}`);
      } else {
        throw new Error(`Failed to create user ${user.email}: ${error.message}`);
      }
    } else {
      user.id = data.user.id;
      console.log(`  Created ${user.email} (${user.id})`);
    }
  }

  // ------------------------------------------------------------------
  // 2. Update profiles with display names
  // ------------------------------------------------------------------
  console.log('\n[2/9] Updating profiles...');
  for (const user of USERS) {
    if (!user.id) continue;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: user.displayName })
      .eq('id', user.id);
    if (error) throw new Error(`Failed to update profile ${user.email}: ${error.message}`);
  }
  console.log('  Profiles updated.');

  // Helper to resolve user id by email
  const userId = (email: string): string => {
    const u = USERS.find(u => u.email === email);
    if (!u?.id) throw new Error(`User id not found for ${email}`);
    return u.id;
  };

  // ------------------------------------------------------------------
  // 3. Create organizations
  // ------------------------------------------------------------------
  console.log('\n[3/9] Creating organizations...');
  for (const org of ORGS) {
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: org.name, slug: org.slug })
      .select('id')
      .single();
    if (error) {
      if (error.message.includes('duplicate key') || error.code === '23505') {
        const { data: existing } = await supabase
          .from('organizations')
          .select('id')
          .eq('slug', org.slug)
          .single();
        if (existing) {
          org.id = existing.id;
          console.log(`  Org ${org.slug} already exists, using id ${org.id}`);
          continue;
        }
      }
      throw new Error(`Failed to create org ${org.slug}: ${error.message}`);
    }
    org.id = data.id;
    console.log(`  Created org ${org.slug} (${org.id})`);
  }

  // ------------------------------------------------------------------
  // 4. Create org memberships
  // ------------------------------------------------------------------
  console.log('\n[4/9] Creating org memberships...');
  const membershipRows: object[] = [];
  for (const org of ORGS) {
    for (const m of org.members) {
      membershipRows.push({
        user_id: userId(m.email),
        org_id: org.id!,
        role: m.role,
      });
    }
  }
  await batchInsert('org_memberships', membershipRows);

  // ------------------------------------------------------------------
  // 5. Create notes (~10,000 total)
  // ------------------------------------------------------------------
  console.log('\n[5/9] Creating notes...');

  interface NoteRow {
    id: string;
    org_id: string;
    created_by: string;
    title: string;
    content: string;
    visibility: string;
    tags: string[];
    current_version: number;
    created_at: string;
    updated_at: string;
  }

  const allNoteRows: NoteRow[] = [];

  for (const org of ORGS) {
    const memberIds = org.members.map(m => userId(m.email));
    for (let i = 0; i < org.noteCount; i++) {
      const visRoll = Math.random();
      const visibility = visRoll < 0.60 ? 'public' : visRoll < 0.85 ? 'shared' : 'private';
      const tagCount = randomInt(2, 5);
      const createdAt = randomDate(365);
      allNoteRows.push({
        id: randomUUID(),
        org_id: org.id!,
        created_by: pick(memberIds),
        title: pick(TITLE_TEMPLATES),
        content: buildNoteContent(),
        visibility,
        tags: pickN(TAG_POOL, tagCount),
        current_version: 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
    }
  }

  await batchInsert('notes', allNoteRows);
  console.log(`  Total notes created: ${allNoteRows.length}`);

  // ------------------------------------------------------------------
  // 6. Create note versions (~30% of notes, 2-5 versions each)
  // ------------------------------------------------------------------
  console.log('\n[6/9] Creating note versions...');

  const noteVersionRows: object[] = [];
  // Build a map of org_id -> memberIds for version changed_by selection
  const orgMemberMap = new Map<string, string[]>(
    ORGS.map(org => [org.id!, org.members.map(m => userId(m.email))])
  );

  // Seed version 1 for every note first, then add extras for ~30%
  const notesGettingVersions = allNoteRows.filter(() => Math.random() < 0.30);

  for (const note of notesGettingVersions) {
    const memberIds = orgMemberMap.get(note.org_id) ?? [];
    const extraVersions = randomInt(1, 4); // 2-5 total, version 1 handled by current_version default
    let versionDate = new Date(note.created_at).getTime();

    for (let v = 2; v <= extraVersions + 1; v++) {
      versionDate += randomInt(1, 72) * 60 * 60 * 1000; // 1-72h later
      noteVersionRows.push({
        id: randomUUID(),
        note_id: note.id,
        version_number: v,
        title: note.title,
        content: buildNoteContent(),
        changed_by: pick(memberIds),
        change_summary: pick(CHANGE_SUMMARIES),
        created_at: new Date(versionDate).toISOString(),
      });
    }
  }

  await batchInsert('note_versions', noteVersionRows);
  console.log(`  Total note versions created: ${noteVersionRows.length}`);

  // ------------------------------------------------------------------
  // 7. Create note shares (for shared notes, 1-3 members per note)
  // ------------------------------------------------------------------
  console.log('\n[7/9] Creating note shares...');

  const sharedNotes = allNoteRows.filter(n => n.visibility === 'shared');
  const noteShareRows: object[] = [];
  const seenSharePairs = new Set<string>();

  for (const note of sharedNotes) {
    const memberIds = (orgMemberMap.get(note.org_id) ?? []).filter(id => id !== note.created_by);
    if (memberIds.length === 0) continue;
    const shareCount = Math.min(randomInt(1, 3), memberIds.length);
    const chosen = pickN(memberIds, shareCount);
    for (const uid of chosen) {
      const key = `${note.id}:${uid}`;
      if (seenSharePairs.has(key)) continue;
      seenSharePairs.add(key);
      noteShareRows.push({
        id: randomUUID(),
        note_id: note.id,
        user_id: uid,
        created_at: randomDate(30),
      });
    }
  }

  await batchInsert('note_shares', noteShareRows);
  console.log(`  Total note shares created: ${noteShareRows.length}`);

  // ------------------------------------------------------------------
  // 8. Upload files + create file records (20-30 files)
  // ------------------------------------------------------------------
  console.log('\n[8/9] Uploading files...');

  const STORAGE_BUCKET = 'org-files';
  await supabase.storage.createBucket(STORAGE_BUCKET, { public: false }).catch(() => {
    // Bucket may already exist; ignore error
  });

  const fileTemplates = [
    { name: 'monthly-report.txt',       label: 'Monthly Report'          },
    { name: 'meeting-notes-attachment.txt', label: 'Meeting Notes'        },
    { name: 'architecture-diagram.txt', label: 'Architecture Diagram'     },
    { name: 'api-spec.txt',             label: 'API Specification'        },
    { name: 'test-results.txt',         label: 'Test Results'             },
    { name: 'release-checklist.txt',    label: 'Release Checklist'        },
    { name: 'security-review.txt',      label: 'Security Review'          },
  ];

  const fileRows: object[] = [];
  const totalFiles = randomInt(20, 30);
  const publicNotes = allNoteRows.filter(n => n.visibility === 'public');

  for (let i = 0; i < totalFiles; i++) {
    const org = pick(ORGS);
    const memberIds = orgMemberMap.get(org.id!) ?? [];
    const tmpl = pick(fileTemplates);
    const noteAttached = Math.random() < 0.6 ? pick(publicNotes.filter(n => n.org_id === org.id!)) : null;

    const fileContent = [
      `${tmpl.label} — ${org.name}`,
      '',
      `Generated by seed script on ${new Date().toISOString()}`,
      '',
      `This document contains sample content for ${org.name}.`,
      'It is intended for development and testing purposes only.',
      '',
      pick(PARA_TEMPLATES),
      '',
      pick(PARA_TEMPLATES),
    ].join('\n');

    const buffer = Buffer.from(fileContent, 'utf-8');
    const fileUUID = randomUUID();
    const filePath = `${org.id}/${fileUUID}_${tmpl.name}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, buffer, { contentType: 'text/plain', upsert: true });

    if (uploadError) {
      console.warn(`  Warning: failed to upload ${filePath}: ${uploadError.message}`);
      continue;
    }

    fileRows.push({
      id: fileUUID,
      org_id: org.id!,
      note_id: noteAttached?.id ?? null,
      uploaded_by: pick(memberIds),
      file_name: tmpl.name,
      file_path: filePath,
      file_size: buffer.byteLength,
      mime_type: 'text/plain',
      created_at: randomDate(180),
    });
  }

  await batchInsert('files', fileRows);
  console.log(`  Total files uploaded: ${fileRows.length}`);

  // ------------------------------------------------------------------
  // 9. Create AI summaries (50-100)
  // ------------------------------------------------------------------
  console.log('\n[9/9] Creating AI summaries...');

  const summaryPool = allNoteRows.filter(n => n.visibility === 'public');
  const summaryCount = randomInt(50, 100);
  const summaryNotes = pickN(summaryPool, summaryCount);
  const aiSummaryRows: object[] = [];

  const overviewTemplates = [
    'This note covers the key decisions and action items from the team discussion.',
    'A comprehensive summary of technical specifications and implementation guidelines.',
    'Highlights from the planning session including timelines, owners, and risks.',
    'This document captures the retrospective findings and agreed process improvements.',
    'An overview of the research findings and recommended next steps.',
    'Summary of the incident, root cause analysis, and remediation actions.',
    'Key points from the security review with prioritized remediation items.',
    'Overview of the product feature specification and acceptance criteria.',
  ];

  const keyPointsPool = [
    'The team agreed to adopt a new caching strategy using Redis.',
    'Performance targets for Q3 are set at P99 < 200ms for all API endpoints.',
    'Security hardening will be completed before the GA launch.',
    'The onboarding documentation needs to be updated with the new auth flow.',
    'Budget approval is required before the infrastructure expansion can proceed.',
    'The retrospective identified communication delays during the handoff phase.',
    'All services must emit structured logs in JSON format by end of quarter.',
    'The MVP scope is frozen — no new features until Phase 1 ships.',
    'Three external vendors were evaluated; the recommendation is Vendor A.',
    'Code coverage must reach 80% before the next release tag.',
  ];

  const actionItemsPool = [
    'Update the deployment runbook with the new rollback steps.',
    'Schedule a follow-up review for the security findings.',
    'Assign ownership of the monitoring dashboard to the DevOps team.',
    'Share the architecture decision record with the broader engineering org.',
    'Create tickets for the identified technical debt items.',
    'Send the compliance checklist to legal for review.',
    'Merge the API spec changes and notify downstream teams.',
    'Run load tests against the staging environment before the release.',
    'Update the on-call runbook with the new escalation path.',
    'Draft the blog post for the public launch announcement.',
  ];

  for (const note of summaryNotes) {
    const memberIds = orgMemberMap.get(note.org_id) ?? [];
    const roll = Math.random();
    const status = roll < 0.40 ? 'pending' : roll < 0.80 ? 'accepted' : 'rejected';
    const acceptedBy = status === 'accepted' ? pick(memberIds) : null;
    const acceptedAt = status === 'accepted' ? randomDate(60) : null;
    const generatedAt = randomDate(90);

    aiSummaryRows.push({
      id: randomUUID(),
      note_id: note.id,
      version_number: 1,
      summary: {
        overview: pick(overviewTemplates),
        key_points: pickN(keyPointsPool, randomInt(2, 4)),
        action_items: pickN(actionItemsPool, randomInt(1, 3)),
        tags_suggested: pickN(TAG_POOL, randomInt(2, 4)),
      },
      status,
      generated_at: generatedAt,
      accepted_at: acceptedAt,
      accepted_by: acceptedBy,
    });
  }

  await batchInsert('ai_summaries', aiSummaryRows);
  console.log(`  Total AI summaries created: ${aiSummaryRows.length}`);

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  console.log('\n--- Seed Summary ---');
  console.log(`Users:         ${USERS.length}`);
  console.log(`Organizations: ${ORGS.length}`);
  console.log(`Notes:         ${allNoteRows.length}`);
  console.log(`Note versions: ${noteVersionRows.length}`);
  console.log(`Note shares:   ${noteShareRows.length}`);
  console.log(`Files:         ${fileRows.length}`);
  console.log(`AI summaries:  ${aiSummaryRows.length}`);
  console.log('');
  console.timeEnd('Seed complete');
}

main().catch(err => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
