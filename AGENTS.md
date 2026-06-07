# TaskFlow Server — Agent Instructions

## Critical: Read Before Writing Any Code

This is an Express.js + Prisma + PostgreSQL backend running on Bun.

Before writing any code in this project:

1. Read `server/RULES.md` for architecture rules.
2. Read `SYSTEM_DESIGN.md` (root) for full system design.
3. Read `API_SPEC.md` (root) for API endpoint contracts.
4. Read `ERD.md` (root) for database schema.

---

## Runtime: Bun

- Use `bun` instead of `node` or `ts-node`.
- Use `bun install` instead of `npm install`.
- Use `bun run <script>` instead of `npm run`.
- Use `bunx <package>` instead of `npx`.
- Bun loads `.env` automatically — do NOT use `dotenv`.

---

## Architecture — Mandatory Patterns

### Module Structure

Every feature follows this exact structure:

```
src/modules/<feature>/
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.repository.ts
├── <feature>.routes.ts
├── <feature>.validation.ts
└── <feature>.types.ts
```

### Dependency Direction (NEVER violate)

```
Controller → Service → Repository → Prisma
```

- Controllers: thin, HTTP only. No business logic.
- Services: all business logic. No req/res.
- Repositories: database access only. No logic.

### Cross-Module Communication

Use the event system. Do NOT import one module's service into another.

```typescript
// Emit in service
eventEmitter.emit("task:statusChanged", { taskId, actorId, oldStatus, newStatus });

// Listen in events/
eventEmitter.on("task:statusChanged", handler);
```

---

## Before Creating Any Code

### Step 1: Search First

Search the codebase for existing implementations:

- Check `src/modules/` for existing feature modules
- Check `src/shared/` for existing utilities, errors, types
- Check `src/middleware/` for existing middleware
- Check `src/config/` for existing configurations

### Step 2: Reuse or Extend

If an implementation already exists:

- Reuse it directly
- Extend it if needed
- Do NOT create a duplicate

### Step 3: Follow Existing Patterns

Look at how existing modules are structured. Match:

- File naming conventions
- Function signatures
- Error handling patterns
- Response format
- Validation patterns

---

## Code Rules

### TypeScript

- Avoid `any`. Always use explicit types.
- Create types in `<feature>.types.ts`.
- Share common types in `src/shared/types/`.
- Use Zod `z.infer<>` for request/response DTOs.

### Validation

- Every endpoint validates input with Zod.
- Schemas live in `<feature>.validation.ts`.
- Use `validate()` middleware in routes.
- Never trust client input.

### Error Handling

- Use centralized error classes from `src/shared/errors/`.
- Throw `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`.
- Never use empty catch blocks.
- Never return generic "Something went wrong" for known errors.

### Response Format

Always return consistent responses:

```typescript
// Success
res.json({ success: true, data: result });

// Success with pagination
res.json({ success: true, data: results, meta: { page, limit, total, totalPages } });

// Errors are handled by error middleware automatically
```

### Database

- Only repositories access Prisma.
- Always filter `deletedAt: null` for soft-deleted entities.
- Use UUIDs for all IDs.
- Use transactions for multi-step operations.

### File Size

- Maximum: 300 lines.
- Preferred: 50–150 lines.
- Split large files into helpers or sub-modules.

---

## Do NOT

- Do NOT use `mongoose` or MongoDB. This project uses PostgreSQL + Prisma.
- Do NOT use `Bun.serve()`. This project uses Express.js.
- Do NOT use `dotenv`. Bun loads `.env` automatically.
- Do NOT expose Prisma models directly. Use DTOs.
- Do NOT put business logic in controllers or repositories.
- Do NOT import between feature modules. Use events.
- Do NOT hardcode role strings. Use enums from `src/shared/types/`.
- Do NOT skip validation on any endpoint.

<!-- Project rule start -->
FOLLOW THE PATTERNS DESCRIBED IN server/RULES.md AND SYSTEM_DESIGN.md
<!-- END:project-rule-state -->
