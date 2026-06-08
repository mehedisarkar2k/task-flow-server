/**
 * Seed script — generates a realistic, demo-ready dataset for manual/dev testing.
 *
 *   bun run scripts/seed.ts            # idempotent: skips users that exist, adds projects
 *   bun run scripts/seed.ts --reset    # first deletes previously-seeded data, then seeds
 *
 * Users are created through Better Auth (so passwords hash into the Account
 * table and the accounts can actually log in). Everything else mirrors the
 * controller logic so the data drives every screen end-to-end:
 *   - Projects with real descriptions + a shaped completion profile so the
 *     dashboard progress bars / KPIs look believable.
 *   - Curated, project-coherent tasks (no random "verb + noun" filler).
 *   - Threaded comments (rich-text HTML, @mentions, some edited → versions).
 *   - An interactive notification feed per user (assigned / status / comment /
 *     mention / member-added / deadline), mixing read / unread / archived.
 *   - Activity-log entries that back the dashboard "Recent Activity" panel.
 */
import { auth } from '../src/config/auth';
import { prisma } from '../src/config/prisma';
import type { Prisma, TaskStatus } from '../generated/prisma';

const PASSWORD = 'Ab@12345';
const DOMAIN = 'taskflow.com'; // seeded accounts use this domain so --reset can find them

// ─── Small random helpers ──────────────────────────────────────────────────
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
};
const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};
const daysFromNow = (d: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, randInt(0, 59), 0, 0);
  return date;
};
const dateOnly = (d: Date) => new Date(d.toISOString().split('T')[0]); // strip time for @db.Date

// ─── Static data pools ──────────────────────────────────────────────────────
const FIRST = ['Aiden', 'Bianca', 'Carlos', 'Dina', 'Emil', 'Farah', 'Gita', 'Hugo', 'Iris', 'Jamal', 'Kira', 'Leo', 'Mona', 'Nadia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Wade', 'Xena', 'Yusuf', 'Zoe'];
const LAST = ['Ahmed', 'Banerjee', 'Chen', 'Diaz', 'Evans', 'Ferraro', 'Gomez', 'Haddad', 'Ibrahim', 'Johansson', 'Kapoor', 'Larsen', 'Mensah', 'Novak', 'Olsen', 'Park', 'Quereshi', 'Rossi', 'Silva', 'Tan', 'Ueda', 'Vargas', 'Wong', 'Xu', 'Yamada', 'Zimmer'];
const DEPTS = ['Engineering', 'Design', 'Product', 'Marketing', 'QA', 'Operations'];
const TITLES = ['Software Engineer', 'Senior Engineer', 'UX Designer', 'Product Analyst', 'QA Engineer', 'DevOps Engineer', 'Content Strategist', 'Data Analyst'];
const LOCATIONS = ['Dhaka, BD', 'Berlin, DE', 'Austin, US', 'Toronto, CA', 'Lisbon, PT', 'Singapore, SG'];
const SKILLS = ['TypeScript', 'React', 'Node.js', 'Postgres', 'Figma', 'Cypress', 'Docker', 'GraphQL', 'Python', 'AWS', 'Tailwind', 'Prisma'];

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
type TaskSpec = { title: string; description: string; priority: Priority; estimate: number };

type ProjectSpec = {
  name: string;
  description: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD';
  deadlineInDays: number;
  /** Target share of tasks that should be COMPLETED — drives progress %. */
  completion: number;
  tasks: TaskSpec[];
};

// Each project gets a real description and a coherent task list so the board,
// task lists, and dashboard read like an actual product team's workspace.
const PROJECTS: ProjectSpec[] = [
  {
    name: 'Atlas Web Platform',
    description:
      'Rebuild of the customer-facing web app on Next.js with a new design system, server components, and a unified auth flow. Goal: cut first-load JS by 40% and ship a consistent component library across marketing and app surfaces.',
    status: 'ACTIVE',
    deadlineInDays: 45,
    completion: 0.55,
    tasks: [
      { title: 'Set up the design-system token pipeline', description: 'Define color, spacing, and typography tokens and wire them into Tailwind + the Figma library so design and code stay in sync.', priority: 'HIGH', estimate: 240 },
      { title: 'Build the responsive app shell and navigation', description: 'Sidebar + top bar layout that collapses cleanly from desktop to mobile, with keyboard navigation support.', priority: 'HIGH', estimate: 300 },
      { title: 'Migrate the marketing homepage to server components', description: 'Move the hero, feature grid, and pricing sections to RSC and measure the first-load JS reduction.', priority: 'MEDIUM', estimate: 240 },
      { title: 'Implement the unified login + signup flow', description: 'Wire Better Auth email/password with proper error states, password rules, and a forgot-password path.', priority: 'HIGH', estimate: 180 },
      { title: 'Add dark mode with system preference detection', description: 'Theme provider with persisted preference and a toggle in the top bar.', priority: 'LOW', estimate: 120 },
      { title: 'Create the reusable data-table component', description: 'Sortable, paginated table with empty/loading states used across the projects and tasks screens.', priority: 'MEDIUM', estimate: 300 },
      { title: 'Wire up global search with keyboard shortcuts', description: 'Command palette (⌘K) that searches projects, tasks, and members.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Set up Playwright end-to-end smoke tests', description: 'Cover login, project create, and task create as a CI gate.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Audit and fix Lighthouse accessibility issues', description: 'Resolve contrast, focus-order, and aria-label findings flagged on the main flows.', priority: 'LOW', estimate: 120 },
      { title: 'Add skeleton loading states to the dashboard', description: 'Replace spinners with content-shaped skeletons for the KPI and chart cards.', priority: 'LOW', estimate: 90 },
      { title: 'Integrate error boundaries and a 500 page', description: 'Friendly fallback UI with a retry action and Sentry capture.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Document the component library in Storybook', description: 'Stories for buttons, inputs, dialogs, and the data table with usage notes.', priority: 'LOW', estimate: 180 },
      { title: 'Optimize image loading with next/image', description: 'Convert hero and avatar images, set sizes, and lazy-load below the fold.', priority: 'MEDIUM', estimate: 90 },
      { title: 'Ship the profile settings page', description: 'Editable professional details, avatar upload, and notification preferences.', priority: 'HIGH', estimate: 240 },
    ],
  },
  {
    name: 'Orbit Mobile App',
    description:
      'Cross-platform mobile companion app with offline-first sync, push notifications, and a streamlined task-capture flow. Targeting iOS and Android from a single React Native codebase.',
    status: 'ACTIVE',
    deadlineInDays: 75,
    completion: 0.3,
    tasks: [
      { title: 'Scaffold the React Native project with Expo', description: 'Set up navigation, theming, and the shared API client with auth token handling.', priority: 'HIGH', estimate: 180 },
      { title: 'Design the offline-first sync engine', description: 'Local SQLite cache with a queue that replays mutations when connectivity returns.', priority: 'HIGH', estimate: 480 },
      { title: 'Implement push notifications via FCM/APNs', description: 'Register devices, handle foreground/background payloads, and deep-link into the task.', priority: 'HIGH', estimate: 300 },
      { title: 'Build the quick task-capture sheet', description: 'Bottom sheet to add a task with title, project, and due date in under five seconds.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Add biometric unlock (Face ID / fingerprint)', description: 'Optional app lock with secure storage for the session token.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Create the swipeable task list', description: 'Swipe to complete or snooze with haptic feedback.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Handle deep links from notifications', description: 'Open the right task/project when a notification is tapped from a cold start.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Set up over-the-air updates with EAS', description: 'Ship JS-only fixes without an app-store round trip.', priority: 'LOW', estimate: 90 },
      { title: 'Add pull-to-refresh and optimistic updates', description: 'Make the list feel instant while sync happens in the background.', priority: 'LOW', estimate: 90 },
      { title: 'Write the onboarding carousel', description: 'Three-screen intro shown on first launch with a skip option.', priority: 'LOW', estimate: 120 },
      { title: 'Instrument analytics events', description: 'Track task-created, task-completed, and session-start for retention analysis.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Test sync conflict resolution', description: 'Verify last-write-wins and surface conflicts the user must resolve manually.', priority: 'HIGH', estimate: 240 },
    ],
  },
  {
    name: 'Beacon Analytics',
    description:
      'Self-serve analytics dashboards and a reporting pipeline that lets teams build charts from their task and project data. Currently paused pending a decision on the warehouse vendor.',
    status: 'ON_HOLD',
    deadlineInDays: 120,
    completion: 0.2,
    tasks: [
      { title: 'Evaluate warehouse options (BigQuery vs. Snowflake)', description: 'Cost, query latency, and ingestion effort comparison with a recommendation memo.', priority: 'HIGH', estimate: 300 },
      { title: 'Design the events ingestion schema', description: 'Define the canonical event envelope and the per-event payloads we will track.', priority: 'HIGH', estimate: 240 },
      { title: 'Prototype the chart builder UI', description: 'Drag-and-drop dimensions/measures with a live preview.', priority: 'MEDIUM', estimate: 480 },
      { title: 'Build the nightly ETL job', description: 'Extract from Postgres, transform into the star schema, and load into the warehouse.', priority: 'MEDIUM', estimate: 300 },
      { title: 'Add saved reports and sharing', description: 'Let users save a chart configuration and share a read-only link.', priority: 'LOW', estimate: 180 },
      { title: 'Implement role-based data scoping', description: 'Ensure members only see analytics for projects they belong to.', priority: 'HIGH', estimate: 180 },
      { title: 'Create the metrics catalog', description: 'Document each metric definition so numbers are consistent across reports.', priority: 'LOW', estimate: 120 },
      { title: 'Spike: real-time vs. batch dashboards', description: 'Decide whether the first version refreshes hourly or on demand.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Add CSV and PDF export', description: 'Export any chart or table for offline sharing.', priority: 'LOW', estimate: 120 },
      { title: 'Set up data-retention and anonymization', description: 'Purge raw events after 90 days and anonymize user identifiers.', priority: 'MEDIUM', estimate: 180 },
    ],
  },
  {
    name: 'Nimbus Infra Migration',
    description:
      'Migrate core services off self-managed VMs onto managed Postgres and container orchestration, with zero-downtime cutover and a hardened CI/CD pipeline. Nearly complete — final cutover and cleanup remain.',
    status: 'ACTIVE',
    deadlineInDays: 30,
    completion: 0.7,
    tasks: [
      { title: 'Provision managed Postgres and replicas', description: 'Stand up the primary + read replica with automated backups and PITR.', priority: 'HIGH', estimate: 240 },
      { title: 'Containerize the API service', description: 'Multi-stage Dockerfile, health checks, and a slim production image.', priority: 'HIGH', estimate: 180 },
      { title: 'Write Terraform for the cluster', description: 'Codify networking, node pools, and secrets so environments are reproducible.', priority: 'HIGH', estimate: 300 },
      { title: 'Set up blue-green deployment', description: 'Cut traffic over with a quick rollback path if health checks fail.', priority: 'HIGH', estimate: 240 },
      { title: 'Migrate data with zero downtime', description: 'Dual-write and backfill, then verify row counts before the final switch.', priority: 'HIGH', estimate: 300 },
      { title: 'Add centralized logging and metrics', description: 'Ship logs to the aggregator and wire up dashboards + alerts.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Configure autoscaling policies', description: 'Scale on CPU and request latency with sane min/max bounds.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Harden secrets management', description: 'Move env secrets into the vault and rotate the database credentials.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Run the production cutover', description: 'Execute the runbook during the maintenance window and monitor closely.', priority: 'HIGH', estimate: 180 },
      { title: 'Decommission the legacy VMs', description: 'Snapshot, archive, and tear down the old instances to stop the spend.', priority: 'LOW', estimate: 90 },
      { title: 'Write the incident runbook', description: 'Document rollback, scaling, and on-call escalation steps.', priority: 'MEDIUM', estimate: 120 },
      { title: 'Load-test the new cluster', description: 'Validate it holds 3x peak traffic before cutover.', priority: 'HIGH', estimate: 180 },
    ],
  },
  {
    name: 'Ledger Billing Revamp',
    description:
      'Complete overhaul of invoicing, subscriptions, proration, and tax handling, replacing the legacy billing service with a provider-backed system. Shipped and fully reconciled.',
    status: 'COMPLETED',
    deadlineInDays: -12,
    completion: 1,
    tasks: [
      { title: 'Integrate the payment provider SDK', description: 'Customers, payment methods, and webhooks wired with idempotency keys.', priority: 'HIGH', estimate: 300 },
      { title: 'Model subscriptions and plans', description: 'Plan tiers, trials, and seat-based pricing in the new schema.', priority: 'HIGH', estimate: 240 },
      { title: 'Implement proration on plan changes', description: 'Charge or credit correctly when customers upgrade or downgrade mid-cycle.', priority: 'HIGH', estimate: 240 },
      { title: 'Add tax calculation by region', description: 'VAT/GST handling driven by the customer billing address.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Generate branded PDF invoices', description: 'Templated invoices with line items, tax, and a payment link.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Build the dunning + retry flow', description: 'Retry failed charges on a schedule and email the customer.', priority: 'MEDIUM', estimate: 180 },
      { title: 'Reconcile webhooks against the ledger', description: 'Nightly job that flags any payment/ledger mismatch.', priority: 'HIGH', estimate: 240 },
      { title: 'Migrate legacy subscriptions', description: 'Move existing customers onto the new system without interrupting billing.', priority: 'HIGH', estimate: 300 },
      { title: 'Add the billing history UI', description: 'Customers can view and download past invoices.', priority: 'LOW', estimate: 120 },
      { title: 'Write end-to-end billing tests', description: 'Cover signup → upgrade → cancel → refund with provider test mode.', priority: 'MEDIUM', estimate: 240 },
    ],
  },
];

// ─── Comment + notification content ──────────────────────────────────────────
const COMMENT_BODIES = [
  'Picked this up — should have a first pass ready by end of day.',
  'Pushed a fix to the branch, please re-test on staging when you get a chance.',
  'Looks solid to me. Nice work on this one. 👏',
  'Can we split the edge cases into a follow-up? Scope is starting to creep here.',
  'Updated the designs in Figma, link is in the description now.',
  'QA passed on the happy path. Moving it along.',
  'I left a couple of comments on the PR — nothing blocking.',
  'Heads up: this depends on the API change landing first.',
  'Confirmed the numbers match production. Good to ship.',
  'Ran into a flaky test here, retrying. Might be unrelated.',
  'Could use a second pair of eyes on the error handling.',
  'Bumped the priority — a customer is waiting on this.',
];
const MENTION_BODIES = [
  'Blocked on the response shape — {mention} can you confirm the contract?',
  'Nice catch {mention}, fixed it in the latest push.',
  '{mention} could you review this when you have a moment?',
  'Handing this over to {mention} for the QA pass.',
  '{mention} this is ready for your sign-off.',
];

const buildBody = (text: string) => `<p>${text}</p>`;
const buildMentionBody = (template: string, userId: string, name: string) =>
  `<p>${template.replace('{mention}', `<mention data-id="${userId}" data-label="${name.split(' ')[0]}">@${name.split(' ')[0]}</mention>`)}</p>`;

// ─── User creation ──────────────────────────────────────────────────────────
type SeededUser = { id: string; email: string; name: string; role: string };

async function ensureUser(opts: { firstName: string; lastName: string; email: string; role: 'ADMIN' | 'PM' | 'MEMBER' }): Promise<SeededUser> {
  const { firstName, lastName, email, role } = opts;
  const name = `${firstName} ${lastName}`;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, role: true } });
  if (existing) return existing;

  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name, role } as any });

  const user = await prisma.user.update({
    where: { email },
    data: {
      firstName,
      lastName,
      role,
      emailVerified: true,
      jobTitle: role === 'ADMIN' ? 'Administrator' : role === 'PM' ? 'Project Manager' : pick(TITLES),
      department: role === 'PM' ? 'Product' : pick(DEPTS),
      location: pick(LOCATIONS),
      phone: `+1${randInt(200, 989)}${randInt(1000000, 9999999)}`,
      bio: `${name} — ${role === 'MEMBER' ? 'individual contributor' : role.toLowerCase()} on the TaskFlow team.`,
      skills: pickN(SKILLS, randInt(3, 6)),
    },
    select: { id: true, email: true, name: true, role: true },
  });
  return user;
}

// ─── Reset ──────────────────────────────────────────────────────────────────
// Purge every account this seed could have created in any prior run — including
// the legacy `taskflow.test` domain — so re-seeding always yields one clean set
// instead of accumulating duplicates.
const SEED_DOMAINS = ['taskflow.com', 'taskflow.test'];

async function resetSeededData() {
  const seededUsers = await prisma.user.findMany({
    where: { OR: SEED_DOMAINS.map((d) => ({ email: { endsWith: `@${d}` } })) },
    select: { id: true },
  });
  const ids = seededUsers.map((u) => u.id);
  if (!ids.length) return;

  // Order matters: Project.creator is a restrict relation, so projects must go
  // before their creators. Deleting a project cascades its columns/tasks/
  // comments/members/assignees/activities.
  const { count: projectCount } = await prisma.project.deleteMany({ where: { createdBy: { in: ids } } });
  // Notifications don't cascade from projects (entityId is a plain string), so
  // remove anything addressed to or raised by a seeded user explicitly.
  const { count: notifCount } = await prisma.notification.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { actorId: { in: ids } }] },
  });
  // Activity logs cascade from project/actor, but null-project rows would linger.
  await prisma.activityLog.deleteMany({ where: { actorId: { in: ids } } });
  // Finally the users themselves (account/session cascade) — this is what makes
  // re-seeding idempotent rather than additive.
  const { count: userCount } = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`  reset: removed ${userCount} user(s), ${projectCount} project(s), ${notifCount} notification(s)`);
}

// ─── Notification timing/state helper ────────────────────────────────────────
const notifications: Prisma.NotificationCreateManyInput[] = [];
const activities: Prisma.ActivityLogCreateManyInput[] = [];

function pushNotification(opts: {
  recipientIds: string[];
  actorId: string | null;
  type: Prisma.NotificationCreateManyInput['type'];
  entityType: Prisma.NotificationCreateManyInput['entityType'];
  entityId: string;
  message: string;
  at: Date;
}) {
  const recipients = [...new Set(opts.recipientIds)].filter((id) => id && id !== opts.actorId);
  const ageDays = (Date.now() - opts.at.getTime()) / (24 * 60 * 60 * 1000);
  for (const userId of recipients) {
    // Older notifications read as resolved; recent ones split unread/read.
    const isRead = ageDays > 3 ? chance(0.85) : chance(0.4);
    const archived = isRead && chance(0.12);
    notifications.push({
      userId,
      actorId: opts.actorId,
      type: opts.type,
      entityType: opts.entityType,
      entityId: opts.entityId,
      message: opts.message,
      isRead: archived ? true : isRead,
      archivedAt: archived ? daysFromNow(-randInt(0, 2)) : null,
      createdAt: opts.at,
    });
  }
}

function pushActivity(opts: {
  actorId: string;
  projectId: string;
  action: string;
  entityType: Prisma.ActivityLogCreateManyInput['entityType'];
  entityId: string;
  message: string;
  at: Date;
}) {
  const { at, ...rest } = opts;
  activities.push({ ...rest, createdAt: at });
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const reset = process.argv.includes('--reset');
  console.log(`\nTaskFlow seed — password for every account: "${PASSWORD}"\n`);

  if (reset) {
    console.log('Resetting…');
    await resetSeededData();
  }

  // 1) Users
  console.log('Creating users…');
  const used = new Set<string>();
  const nextName = () => {
    let f: string, l: string, key: string;
    do {
      f = pick(FIRST);
      l = pick(LAST);
      key = `${f} ${l}`;
    } while (used.has(key));
    used.add(key);
    return { firstName: f, lastName: l };
  };

  const admin = await ensureUser({ ...nextName(), role: 'ADMIN', email: `admin@${DOMAIN}` });
  const pms: SeededUser[] = [];
  for (let i = 1; i <= 2; i++) pms.push(await ensureUser({ ...nextName(), role: 'PM', email: `pm${i}@${DOMAIN}` }));
  const members: SeededUser[] = [];
  for (let i = 1; i <= 20; i++) members.push(await ensureUser({ ...nextName(), role: 'MEMBER', email: `user${i}@${DOMAIN}` }));

  console.log(`  1 admin, ${pms.length} PM, ${members.length} members (${1 + pms.length + members.length} total)`);

  const nameById = new Map<string, string>([admin, ...pms, ...members].map((u) => [u.id, u.name]));

  // 2) Lead pool: Admin + PMs → distinct leads across 5 projects.
  const leadPool: SeededUser[] = [admin, ...pms];

  // 3) Projects + columns + tasks + comments + notifications + activity
  console.log('Creating projects, tasks, comments, notifications, activity…');
  let totalTasks = 0;
  let totalComments = 0;

  for (let p = 0; p < PROJECTS.length; p++) {
    const spec = PROJECTS[p];
    const lead = leadPool[p % leadPool.length];

    // Project members: lead + 5-8 others. The ADMIN joins the first project so
    // the admin demo login also has assigned tasks + an active notification feed.
    const others = pickN(members.filter((m) => m.id !== lead.id), randInt(5, 8));
    const projectMemberIds = [lead.id, ...others.map((o) => o.id)];
    if (p === 0 && !projectMemberIds.includes(admin.id)) projectMemberIds.push(admin.id);

    const createdAtBase = daysFromNow(-randInt(30, 60));
    const deadline = daysFromNow(spec.deadlineInDays);

    const project = await prisma.project.create({
      data: {
        name: spec.name,
        description: spec.description,
        status: spec.status,
        deadline: dateOnly(deadline),
        createdBy: lead.id,
        createdAt: createdAtBase,
        members: {
          create: projectMemberIds.map((userId) => ({
            userId,
            role: userId === lead.id ? 'LEAD' : 'MEMBER',
            addedAt: createdAtBase,
          })),
        },
        columns: {
          create: [
            { name: 'Todo', color: 'muted', position: 0, mappedStatus: 'TODO' },
            { name: 'In Progress', color: 'primary', position: 1, mappedStatus: 'IN_PROGRESS' },
            { name: 'Completed', color: 'emerald', position: 2, mappedStatus: 'COMPLETED' },
          ],
        },
      },
      include: { columns: { orderBy: { position: 'asc' } } },
    });

    pushActivity({
      actorId: lead.id,
      projectId: project.id,
      action: 'PROJECT_CREATED',
      entityType: 'PROJECT',
      entityId: project.id,
      message: `${lead.name} created project "${spec.name}"`,
      at: createdAtBase,
    });
    pushNotification({
      recipientIds: projectMemberIds,
      actorId: lead.id,
      type: 'PROJECT_MEMBER_ADDED',
      entityType: 'PROJECT',
      entityId: project.id,
      message: `"${lead.name}" added you to project "${spec.name}".`,
      at: createdAtBase,
    });

    // Deadline reminder for projects whose deadline is near and still open.
    if (spec.status !== 'COMPLETED' && spec.deadlineInDays <= 35) {
      pushNotification({
        recipientIds: [lead.id],
        actorId: null,
        type: 'PROJECT_DEADLINE_APPROACHING',
        entityType: 'PROJECT',
        entityId: project.id,
        message: `Project "${spec.name}" deadline is approaching.`,
        at: daysFromNow(-randInt(0, 2)),
      });
    }

    const colByStatus = new Map<TaskStatus, { id: string }>();
    for (const c of project.columns) if (c.mappedStatus) colByStatus.set(c.mappedStatus, c);

    // Assign a status to each task to hit the project's completion target, then
    // split the remainder between in-progress and todo.
    const taskSpecs = shuffle(spec.tasks);
    const completedCount = Math.round(taskSpecs.length * spec.completion);
    const inProgressCount =
      spec.status === 'COMPLETED' ? 0 : Math.round((taskSpecs.length - completedCount) * 0.55);

    const positionByCol = new Map<string, number>();
    const createdTasks: { id: string; title: string; createdBy: string; assigneeIds: string[]; status: TaskStatus }[] = [];

    for (let t = 0; t < taskSpecs.length; t++) {
      const ts = taskSpecs[t];
      const status: TaskStatus =
        t < completedCount ? 'COMPLETED' : t < completedCount + inProgressCount ? 'IN_PROGRESS' : 'TODO';
      const column = colByStatus.get(status)!;
      const pos = positionByCol.get(column.id) ?? 0;
      positionByCol.set(column.id, pos + 1);

      const completed = status === 'COMPLETED';
      const assigneeIds = pickN(projectMemberIds, randInt(1, 2));
      const creatorId = pick(projectMemberIds);
      const taskCreatedAt = daysFromNow(-randInt(5, 28));
      const completedAt = completed ? daysFromNow(-randInt(1, 14)) : null;

      // Overdue (non-completed, past due) vs. upcoming spread for the dashboard.
      const dueOffset = completed ? randInt(-20, -2) : chance(0.25) ? randInt(-6, -1) : randInt(1, 30);

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          columnId: column.id,
          position: pos,
          title: ts.title,
          description: ts.description,
          status,
          priority: ts.priority,
          dueDate: dateOnly(daysFromNow(dueOffset)),
          estimatedMinutes: ts.estimate,
          createdBy: creatorId,
          createdAt: taskCreatedAt,
          completedAt,
          assignees: { create: assigneeIds.map((userId) => ({ userId, assignedAt: taskCreatedAt })) },
        },
      });
      createdTasks.push({ id: task.id, title: ts.title, createdBy: creatorId, assigneeIds, status });
      totalTasks++;

      // Assignment notifications + activity.
      pushNotification({
        recipientIds: assigneeIds,
        actorId: creatorId,
        type: 'TASK_ASSIGNED',
        entityType: 'TASK',
        entityId: task.id,
        message: `"${nameById.get(creatorId)}" assigned you to task "${ts.title}".`,
        at: taskCreatedAt,
      });

      if (completed && completedAt) {
        const completer = pick(assigneeIds);
        pushActivity({
          actorId: completer,
          projectId: project.id,
          action: 'TASK_STATUS_CHANGED',
          entityType: 'TASK',
          entityId: task.id,
          message: `Task "${ts.title}" marked as Completed`,
          at: completedAt,
        });
        pushNotification({
          recipientIds: [creatorId, lead.id],
          actorId: completer,
          type: 'TASK_STATUS_CHANGED',
          entityType: 'TASK',
          entityId: task.id,
          message: `"${nameById.get(completer)}" changed "${ts.title}" status to COMPLETED.`,
          at: completedAt,
        });
      } else if (status === 'IN_PROGRESS') {
        const mover = pick(assigneeIds);
        pushActivity({
          actorId: mover,
          projectId: project.id,
          action: 'TASK_STATUS_CHANGED',
          entityType: 'TASK',
          entityId: task.id,
          message: `Task "${ts.title}" moved to In Progress`,
          at: daysFromNow(-randInt(1, 8)),
        });
      }
    }

    // Comments — discussion on ~45% of tasks, with mentions + some edits.
    for (const task of createdTasks) {
      if (!chance(0.45)) continue;
      const participants = [...new Set([task.createdBy, ...task.assigneeIds])];
      const commentCount = randInt(1, 4);
      const priorCommenters = new Set<string>();

      for (let c = 0; c < commentCount; c++) {
        const author = pick(projectMemberIds);
        const commentAt = daysFromNow(-randInt(0, 12));
        const mentionTarget = participants.find((id) => id !== author);

        let body: string;
        let mentionedId: string | null = null;
        if (mentionTarget && chance(0.35)) {
          mentionedId = mentionTarget;
          body = buildMentionBody(pick(MENTION_BODIES), mentionTarget, nameById.get(mentionTarget) ?? 'there');
        } else {
          body = buildBody(pick(COMMENT_BODIES));
        }

        const edited = chance(0.25);
        const comment = await prisma.comment.create({
          data: {
            taskId: task.id,
            userId: author,
            body,
            isEdited: edited,
            createdAt: commentAt,
            ...(edited
              ? { versions: { create: { body: buildBody('(earlier draft of this comment)'), editedAt: commentAt } } }
              : {}),
          },
        });
        totalComments++;

        pushActivity({
          actorId: author,
          projectId: project.id,
          action: 'COMMENT_ADDED',
          entityType: 'COMMENT',
          entityId: comment.id,
          message: `${nameById.get(author)} commented on "${task.title}"`,
          at: commentAt,
        });

        const recipients = [...participants, ...priorCommenters].filter((id) => id !== mentionedId);
        pushNotification({
          recipientIds: recipients,
          actorId: author,
          type: 'COMMENT_ADDED',
          entityType: 'TASK',
          entityId: task.id,
          message: `"${nameById.get(author)}" commented on task "${task.title}".`,
          at: commentAt,
        });
        if (mentionedId) {
          pushNotification({
            recipientIds: [mentionedId],
            actorId: author,
            type: 'COMMENT_MENTION',
            entityType: 'TASK',
            entityId: task.id,
            message: `"${nameById.get(author)}" mentioned you in a comment on "${task.title}".`,
            at: commentAt,
          });
        }
        priorCommenters.add(author);
      }
    }

    const completedTasks = createdTasks.filter((t) => t.status === 'COMPLETED').length;
    const progress = Math.round((completedTasks / createdTasks.length) * 100);
    console.log(
      `  • ${spec.name} [${spec.status}] — lead ${lead.name}, ${projectMemberIds.length} members, ${createdTasks.length} tasks, ${progress}% done`,
    );
  }

  // 4) Flush notifications + activity in bulk.
  console.log('Writing notifications + activity…');
  if (notifications.length) await prisma.notification.createMany({ data: notifications });
  if (activities.length) await prisma.activityLog.createMany({ data: activities });

  // 5) Summary
  console.log('\n✓ Seed complete');
  console.log(`  users: 23 (1 admin, 2 PM, 20 member)`);
  console.log(`  projects: ${PROJECTS.length}, tasks: ${totalTasks}, comments: ${totalComments}`);
  console.log(`  notifications: ${notifications.length}, activity entries: ${activities.length}`);
  console.log('\nLogin credentials (password for all: ' + PASSWORD + '):');
  console.log(`  ADMIN  ${admin.email}`);
  for (const pm of pms) console.log(`  PM     ${pm.email}`);
  console.log(`  MEMBER ${members[0].email}  (+ ${members.length - 1} more @${DOMAIN})`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
