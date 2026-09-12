# Admin Honda WPM - Step 0 Setup

Full-stack starter with clean modular structure:

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS
- Backend: Node.js, Express, Prisma ORM, PostgreSQL
- Security: JWT auth, RBAC, shop-aware multi-tenant hooks

## Project Structure

```
apps/
  web/   # Next.js frontend
  api/   # Express + Prisma backend
```

## Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+

## Install

From repository root:

```bash
npm install
```

## Environment

Create env files:

1. Root `.env` from `.env.example`
2. `apps/api/.env` from `apps/api/.env.example`
3. `apps/web/.env.local` from `apps/web/.env.example`

## Database Setup

### Option A — Supabase (recommended, cloud, multi-machine)

1. Create a project at https://supabase.com
2. Go to **Project Settings → Database → Connection string**
3. Copy both URLs into `apps/api/.env`:
   - `DATABASE_URL` → **Session / Pooled** URL (port 6543, add `?pgbouncer=true`)
   - `DIRECT_URL` → **Direct** URL (port 5432, no pooler suffix)
4. Run setup commands:

```bash
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate
npm --workspace apps/api run rbac:backfill
```

### Option B — Local PostgreSQL

1. Install PostgreSQL 14+ on your machine
2. Create database: `admin_honda_wpm`
3. Set in `apps/api/.env`:
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/admin_honda_wpm`
   - `DIRECT_URL=postgresql://postgres:postgres@localhost:5432/admin_honda_wpm`
4. Run the same setup commands as Option A

### Team / new machine onboarding

```bash
git clone <repo>
# Add apps/api/.env with hosted DATABASE_URL + DIRECT_URL + JWT_SECRET
npm install
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate
npm run dev:api
npm run dev:web
```

RBAC migration notes:

- `rbac:backfill` creates required roles (`SUPER_ADMIN`, `SHOP_ADMIN`, `STOREKEEPER`, `JOB_CARD_MANAGER`) per shop.
- It backfills `User.roleId` from legacy `User.role` when available.
- If users still have `null roleId`, assign role mappings manually for those accounts.

## Run

Frontend:

```bash
npm run dev:web
```

Backend:

```bash
npm run dev:api
```

Health endpoint:

`GET http://localhost:4000/api/v1/health`

## Notes

- Auth login validates credentials against database users and password hashes.
- Multi-tenant data boundaries are scaffolded with `shopId` in JWT context and middleware guard.

## Auth + RBAC

- JWT login endpoint: `POST /api/v1/auth/login`
- JWT profile endpoint: `GET /api/v1/auth/me` (protected)
- Permission middleware: `checkPermission(action)` where `action` is `read`, `write`, or `delete`

Role permissions:

- `SUPER_ADMIN`: full system (`read`, `write`, `delete`)
- `SHOP_ADMIN`: full access in own shop (`read`, `write`, `delete`)
- `STOREKEEPER`: `read`, `write` only (no delete)
- `JOB_CARD_MANAGER`: `read`, `write` only (no delete)

Example protected routes:

- `GET /api/v1/parts` requires `read`
- `POST /api/v1/parts` requires `write`
- `PUT /api/v1/parts/:id` requires `write`
- `DELETE /api/v1/parts/:id` requires `delete` (blocked for Storekeeper and Job Card Manager)
