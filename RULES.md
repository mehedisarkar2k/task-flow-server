# TaskFlow Server — Architecture Rules

## Tech Stack

Always use:

- Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- Better Auth
- Zod (validation)
- Bun (runtime)

Do not introduce alternative libraries unless explicitly requested.

---

## Runtime: Bun

- Use `bun` instead of `node` or `ts-node`.
- Use `bun install` instead of `npm install`.
- Use `bun run <script>` instead of `npm run`.
- Use `bunx <package>` instead of `npx`.
- Bun automatically loads `.env` — do not use `dotenv`.

---

## Folder Structure

```
src/
├── modules/          # Feature-based modules
├── shared/           # Shared errors, utils, types, constants, schemas
├── config/           # Database, auth, cloudflare, env configs
├── middleware/       # Auth, role, error, validate, upload middleware
├── events/           # Event emitter, notification events, activity events
└── index.ts          # Express app entry
```

Business logic is organized by feature module.

---

## Feature Module Structure

Each feature follows this structure:

```
src/modules/project/
├── project.controller.ts     # HTTP layer — thin
├── project.service.ts        # Business logic
├── project.repository.ts     # Database access only
├── project.routes.ts         # Route definitions
└── project.types.ts          # Types and DTOs
```

---

## Controller

Responsibilities:

- Receive request
- Call validation (via middleware or inline)
- Call service
- Return response

Controllers must remain thin.

No business logic in controllers.

```typescript
// Good
const createProject = async (req: Request, res: Response) => {
  const data = req.body;
  const result = await projectService.create(data, req.user.id);
  res.status(201).json({ success: true, data: result });
};

// Bad — business logic in controller
const createProject = async (req: Request, res: Response) => {
  const existing = await prisma.project.findFirst({ where: { name: req.body.name } });
  if (existing) throw new Error("Already exists");
  // ...more logic
};
```

---

## Service

Responsibilities:

- Business logic
- Orchestration
- Workflow rules
- Calling repositories
- Emitting events

Services must NOT know HTTP details.

Do not use `req`, `res`, or `next` in services.

```typescript
// Good
class ProjectService {
  async create(data: CreateProjectDto, userId: string) {
    const project = await projectRepository.create({ ...data, createdBy: userId });
    eventEmitter.emit("project:created", { projectId: project.id, actorId: userId });
    return project;
  }
}

// Bad — using req/res in service
async create(req: Request, res: Response) { ... }
```

---

## Repository

Responsibilities:

- Database access only (Prisma queries)
- No business logic
- No validation
- No HTTP details

```typescript
// Good
class ProjectRepository {
  async findById(id: string) {
    return prisma.project.findUnique({ where: { id, deletedAt: null } });
  }

  async create(data: Prisma.ProjectCreateInput) {
    return prisma.project.create({ data });
  }

  async findByMember(userId: string, filters: ProjectFilters) {
    return prisma.project.findMany({
      where: { deletedAt: null, members: { some: { userId } }, ...filters },
    });
  }
}

// Bad — business logic in repository
async createIfNotExists(name: string) {
  const existing = await this.findByName(name);
  if (existing) throw new Error("Already exists"); // This belongs in service
}
```

---

## Validation

Use Zod for all input validation.

Every endpoint should validate request body, params, and query.

Never trust client input.

All validation schemas must be placed in `src/shared/schemas/`.

```typescript
// src/shared/schemas/project.schema.ts
import { z } from "zod";

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    deadline: z.string().datetime().refine(
      (date) => new Date(date) > new Date(),
      { message: "Please select a valid deadline." }
    ),
    status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD"]),
  })
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>["body"];
```

Use the validate middleware to apply schemas:

```typescript
// project.routes.ts
router.post("/", requireRole("ADMIN", "PM"), validate(createProjectSchema), projectController.create);
```

---

## DTOs

Create DTOs for request and response contracts.

Do not expose Prisma models directly to the API.

```typescript
// Good — map to DTO before returning
const toProjectResponse = (project: ProjectWithRelations): ProjectDto => ({
  id: project.id,
  name: project.name,
  status: project.status,
  createdBy: { id: project.creator.id, name: project.creator.name },
  progress: calculateProgress(project.tasks),
  // ... only what the client needs
});

// Bad — returning raw Prisma model
res.json({ success: true, data: project });  // Exposes deletedAt, internal fields
```

---

## Events

Cross-module communication uses events.

Do not import one module's service directly into another.

```typescript
// In service — emit events
eventEmitter.emit("task:created", { taskId, projectId, actorId });
eventEmitter.emit("task:statusChanged", { taskId, actorId, oldStatus, newStatus });

// In events/ — listen and react
eventEmitter.on("task:created", async (payload) => {
  await activityService.log(payload);
  await notificationService.notifyTaskAssigned(payload);
});
```

Events to define:

- `project:created`, `project:updated`, `project:deleted`, `project:statusChanged`
- `task:created`, `task:updated`, `task:deleted`, `task:statusChanged`, `task:assigned`
- `member:added`, `member:removed`
- `comment:created`
- `attachment:uploaded`

---

## Error Handling

Use centralized error handling. Do not scatter try/catch everywhere.

### Error Classes

```
src/shared/errors/
├── app-error.ts            # Base error class
├── validation-error.ts     # 422 — input validation failed
├── not-found-error.ts      # 404 — resource not found
├── forbidden-error.ts      # 403 — insufficient permissions
├── conflict-error.ts       # 409 — duplicate resource
└── unauthorized-error.ts   # 401 — not authenticated
```

### Usage

```typescript
// In service
if (!project) throw new NotFoundError("Project not found.");
if (user.role !== "ADMIN") throw new ForbiddenError("You don't have permission.");
if (existingTask) throw new ConflictError("A task with this title already exists in this project.");
```

### Error Middleware

```typescript
// middleware/error.middleware.ts — catches all thrown errors
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  }
  // Unexpected error
  console.error(err);
  res.status(500).json({ success: false, message: "Something went wrong." });
});
```

---

## Response Format

Use consistent API responses everywhere.

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Success with Pagination

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 48,
    "totalPages": 4
  }
}
```

### Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "title", "message": "Task title is required" }
  ]
}
```

---

## Database Rules

- Repositories are the ONLY layer that accesses Prisma.
- All IDs are UUID v4.
- Soft deletes use `deletedAt` timestamp.
- Always filter `deletedAt: null` in queries (unless explicitly querying deleted items).
- Use transactions for multi-step operations.

### Dependency Direction

```
Controller → Service → Repository → Prisma
```

Never reverse this flow:

```
❌ Repository → Controller
❌ Service → Controller
❌ Controller → Prisma (bypass repository)
```

---

## Middleware

### Auth Middleware

```typescript
// Verify session via Better Auth
const requireAuth = async (req, res, next) => {
  const session = await auth.getSession(req);
  if (!session) throw new UnauthorizedError("Not authenticated.");
  req.user = session.user;
  next();
};
```

### Role Middleware

```typescript
// Check user role
const requireRole = (...roles: Role[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new ForbiddenError("You don't have permission to perform this action.");
  }
  next();
};
```

### Validate Middleware

```typescript
// Validate request body with Zod schema
const validate = (schema: ZodSchema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.issues);
  }
  req.body = result.data;
  next();
};
```

---

## Route Organization

```typescript
// project.routes.ts
import { Router } from "express";

const router = Router();

router.get("/", requireAuth, projectController.list);
router.post("/", requireAuth, requireRole("ADMIN", "PM"), validate(createProjectSchema), projectController.create);
router.get("/:projectId", requireAuth, requireProjectAccess, projectController.getById);
router.put("/:projectId", requireAuth, requireProjectAccess, requireRole("ADMIN", "PM"), validate(updateProjectSchema), projectController.update);
router.delete("/:projectId", requireAuth, requireProjectAccess, requireRole("ADMIN", "PM"), projectController.delete);

export default router;
```

```typescript
// index.ts — mount all routes
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/attachments", attachmentRoutes);
```

---

## Config

```
src/config/
├── database.ts       # Prisma client singleton
├── auth.ts           # Better Auth setup
├── cloudflare.ts     # R2 client (S3-compatible)
└── env.ts            # Environment variable validation with Zod
```

### Environment Validation

```typescript
// config/env.ts
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  CF_ACCOUNT_ID: z.string(),
  CF_R2_ACCESS_KEY_ID: z.string(),
  CF_R2_SECRET_ACCESS_KEY: z.string(),
  CF_R2_BUCKET_NAME: z.string(),
});

export const env = envSchema.parse(process.env);
```

---

## File Size Rules

Preferred: 50–150 lines.
Warning: 200+ lines.
Maximum: 300 lines.

If a file grows too large:

- Extract helper functions to `shared/utils/`
- Extract types to `*.types.ts`
- Split complex services into sub-services

---

## Naming Rules

Controllers: `project.controller.ts`
Services: `project.service.ts`
Repositories: `project.repository.ts`
Routes: `project.routes.ts`
Schemas: `src/shared/schemas/project.schema.ts`
Types: `project.types.ts`

Functions:

- Good: `createProject`, `findTaskById`, `updateMemberRole`
- Bad: `doStuff`, `helper`, `process`

---

## Reference Documents

| Document | Purpose |
|---|---|
| `SYSTEM_DESIGN.md` | Full architecture, auth flows, RBAC matrix, notifications |
| `API_SPEC.md` | All endpoint contracts |
| `ERD.md` | Database schema |
| `RULES.md` (root) | Project-wide rules |
