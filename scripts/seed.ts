/**
 * Seed script — generates a realistic dataset for manual/dev testing.
 *
 *   bun run scripts/seed.ts            # idempotent: skips users that exist, adds projects
 *   bun run scripts/seed.ts --reset    # first deletes previously-seeded projects, then seeds
 *
 * Users are created through Better Auth (so passwords hash into the Account
 * table and the accounts can actually log in). Projects/columns/tasks mirror
 * the controller logic (default Kanban columns, creator = LEAD, status matches
 * the column's mappedStatus).
 *
 * Composition: 1 ADMIN + 2 PM + 20 MEMBER (= 23 users), 5 projects, 20-30
 * tasks per project across all three columns. All users share one password.
 */
import { auth } from '../src/config/auth';
import { prisma } from '../src/config/prisma';
import type { TaskStatus } from '../generated/prisma';

const PASSWORD = 'Taskflow@2026';
const DOMAIN = 'taskflow.test'; // seeded accounts use this domain so --reset can find them

// ─── Small random helpers ──────────────────────────────────────────────────
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return out;
};
const daysFromNow = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);
const dateOnly = (d: Date) => new Date(d.toISOString().split('T')[0]); // strip time for @db.Date

// ─── Static data pools ──────────────────────────────────────────────────────
const FIRST = ['Aiden', 'Bianca', 'Carlos', 'Dina', 'Emil', 'Farah', 'Gita', 'Hugo', 'Iris', 'Jamal', 'Kira', 'Leo', 'Mona', 'Nadia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara', 'Umar', 'Vera', 'Wade', 'Xena', 'Yusuf', 'Zoe'];
const LAST = ['Ahmed', 'Banerjee', 'Chen', 'Diaz', 'Evans', 'Ferraro', 'Gomez', 'Haddad', 'Ibrahim', 'Johansson', 'Kapoor', 'Larsen', 'Mensah', 'Novak', 'Olsen', 'Park', 'Quereshi', 'Rossi', 'Silva', 'Tan', 'Ueda', 'Vargas', 'Wong', 'Xu', 'Yamada', 'Zimmer'];
const DEPTS = ['Engineering', 'Design', 'Product', 'Marketing', 'QA', 'Operations'];
const TITLES = ['Software Engineer', 'Senior Engineer', 'UX Designer', 'Product Analyst', 'QA Engineer', 'DevOps Engineer', 'Content Strategist', 'Data Analyst'];
const LOCATIONS = ['Dhaka, BD', 'Berlin, DE', 'Austin, US', 'Toronto, CA', 'Lisbon, PT', 'Singapore, SG'];
const SKILLS = ['TypeScript', 'React', 'Node.js', 'Postgres', 'Figma', 'Cypress', 'Docker', 'GraphQL', 'Python', 'AWS', 'Tailwind', 'Prisma'];

const PROJECTS = [
  { name: 'Atlas Web Platform', description: 'Customer-facing web app rebuild on Next.js with a new design system.', status: 'ACTIVE' as const, deadline: daysFromNow(45) },
  { name: 'Orbit Mobile App', description: 'Cross-platform mobile companion app with offline-first sync.', status: 'ACTIVE' as const, deadline: daysFromNow(75) },
  { name: 'Beacon Analytics', description: 'Self-serve analytics dashboards and reporting pipeline.', status: 'ON_HOLD' as const, deadline: daysFromNow(120) },
  { name: 'Nimbus Infra Migration', description: 'Migrate services to managed Postgres and container orchestration.', status: 'ACTIVE' as const, deadline: daysFromNow(30) },
  { name: 'Ledger Billing Revamp', description: 'Overhaul of invoicing, subscriptions, and tax handling.', status: 'COMPLETED' as const, deadline: daysFromNow(-10) },
];

const TASK_VERBS = ['Implement', 'Design', 'Fix', 'Refactor', 'Investigate', 'Document', 'Optimize', 'Add', 'Review', 'Migrate', 'Test', 'Wire up'];
const TASK_NOUNS = ['login flow', 'dashboard widgets', 'API pagination', 'dark mode', 'search indexing', 'email notifications', 'file uploads', 'role permissions', 'audit logging', 'caching layer', 'onboarding wizard', 'export to CSV', 'rate limiting', 'webhook handlers', 'mobile layout', 'error boundaries', 'data retention job', 'feature flags', 'session refresh', 'analytics events'];
const PRIORITIES = ['HIGH', 'MEDIUM', 'MEDIUM', 'LOW'] as const; // weighted toward MEDIUM

// ─── User creation ──────────────────────────────────────────────────────────
type SeededUser = { id: string; email: string; name: string; role: string };

async function ensureUser(opts: { firstName: string; lastName: string; role: 'ADMIN' | 'PM' | 'MEMBER'; index: number }): Promise<SeededUser> {
  const { firstName, lastName, role, index } = opts;
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@${DOMAIN}`;

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
async function resetSeededProjects() {
  const seededUsers = await prisma.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = seededUsers.map((u) => u.id);
  if (!ids.length) return;
  const { count } = await prisma.project.deleteMany({ where: { createdBy: { in: ids } } });
  console.log(`  reset: deleted ${count} previously-seeded project(s) (cascade removed their columns/tasks/members/assignees)`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const reset = process.argv.includes('--reset');
  console.log(`\nTaskFlow seed — password for every account: "${PASSWORD}"\n`);

  if (reset) {
    console.log('Resetting…');
    await resetSeededProjects();
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

  const admin = await ensureUser({ ...nextName(), role: 'ADMIN', index: 0 });
  const pms: SeededUser[] = [];
  for (let i = 0; i < 2; i++) pms.push(await ensureUser({ ...nextName(), role: 'PM', index: i }));
  const members: SeededUser[] = [];
  for (let i = 0; i < 20; i++) members.push(await ensureUser({ ...nextName(), role: 'MEMBER', index: i }));

  console.log(`  ${1} admin, ${pms.length} PM, ${members.length} members (${1 + pms.length + members.length} total)`);

  // 2) Lead pool: 2 PMs + 2 senior members → 4 distinct leads across 5 projects (one leads 2)
  const leadPool: SeededUser[] = [pms[0], pms[1], members[0], members[1]];

  // 3) Projects + columns + tasks
  console.log('Creating projects, columns, and tasks…');
  let totalTasks = 0;
  for (let p = 0; p < PROJECTS.length; p++) {
    const spec = PROJECTS[p];
    const lead = leadPool[p % leadPool.length];

    // project members: the lead + 5-8 others (anyone except the lead)
    const others = pickN(members.filter((m) => m.id !== lead.id), randInt(5, 8));
    const projectMemberIds = [lead.id, ...others.map((o) => o.id)];

    const project = await prisma.project.create({
      data: {
        name: spec.name,
        description: spec.description,
        status: spec.status,
        deadline: dateOnly(spec.deadline),
        createdBy: lead.id,
        members: {
          create: projectMemberIds.map((userId) => ({ userId, role: userId === lead.id ? 'LEAD' : 'MEMBER' })),
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

    // Distribute 20-30 tasks across the three columns. Weight: ~40% todo, ~35% in-progress, ~25% done.
    const taskCount = randInt(20, 30);
    const colByStatus = new Map<TaskStatus, { id: string }>();
    for (const c of project.columns) if (c.mappedStatus) colByStatus.set(c.mappedStatus, c);
    const positionByCol = new Map<string, number>();

    for (let t = 0; t < taskCount; t++) {
      const r = Math.random();
      const status: TaskStatus = r < 0.4 ? 'TODO' : r < 0.75 ? 'IN_PROGRESS' : 'COMPLETED';
      const column = colByStatus.get(status)!;
      const pos = positionByCol.get(column.id) ?? 0;
      positionByCol.set(column.id, pos + 1);

      const completed = status === 'COMPLETED';
      const assignees = pickN(projectMemberIds, randInt(1, 2));

      await prisma.task.create({
        data: {
          projectId: project.id,
          columnId: column.id,
          position: pos,
          title: `${pick(TASK_VERBS)} ${pick(TASK_NOUNS)}`,
          description: pick([null, 'Tracked as part of the current milestone.', 'Blocked pending review.', 'Follow-up from last sprint planning.']),
          status,
          priority: pick(PRIORITIES),
          dueDate: dateOnly(daysFromNow(randInt(-15, 40))),
          estimatedMinutes: pick([30, 60, 90, 120, 180, 240, 480]),
          createdBy: pick(projectMemberIds),
          completedAt: completed ? daysFromNow(-randInt(1, 14)) : null,
          assignees: { create: assignees.map((userId) => ({ userId })) },
        },
      });
      totalTasks++;
    }

    console.log(`  • ${spec.name} — lead ${lead.name}, ${projectMemberIds.length} members, ${taskCount} tasks`);
  }

  // 4) Summary
  console.log('\n✓ Seed complete');
  console.log(`  users: 23 (1 admin, 2 PM, 20 member)`);
  console.log(`  projects: ${PROJECTS.length}, tasks: ${totalTasks}`);
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
