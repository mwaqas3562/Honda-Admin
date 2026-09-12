# Running Honda Admin

This guide starts the Honda Workshop Planning and Management application locally.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 14 or newer, local or hosted
- Git

## 1. Clone and install

```powershell
git clone https://github.com/mwaqas3562/Honda-Admin.git
Set-Location Honda-Admin
npm install
```

## 2. Configure environment files

Create the API environment file:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Create the web environment file:

```powershell
Copy-Item apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env` and set:

- `DATABASE_URL`: PostgreSQL runtime connection string
- `DIRECT_URL`: direct PostgreSQL connection string for Prisma migrations and seed scripts
- `JWT_SECRET`: a random value of at least 32 characters
- `PORT`: normally `4000`
- `CORS_ORIGINS`: `http://localhost:3000` for a restricted local setup, or leave the development default

The web file normally uses:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
```

Never commit `.env` or `.env.local` files.

## 3. Prepare the database

From the repository root:

```powershell
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate
```

To create the sample shop, roles, and development users:

```powershell
Set-Location apps/api
node prisma/seed.cjs
Set-Location ../..
```

The seed users all use the password `password123`:

| Role | Email |
| --- | --- |
| Super admin | `admin@honda.local` |
| Shop admin | `manager@honda.local` |
| Storekeeper | `store@honda.local` |
| Job card manager | `jobcard@honda.local` |

Change or remove these development accounts before using a shared or production database.

## 4. Start the application

Open two PowerShell windows from the repository root.

API window:

```powershell
npm run dev:api
```

Web window:

```powershell
npm run dev:web
```

The normal local URLs are:

- Web app: <http://localhost:3000>
- API: <http://localhost:4000>
- API health check: <http://localhost:4000/api/v1/health>

If port 3000 is already occupied, Next.js may select port 3001. Use the URL printed in the web terminal and update `CORS_ORIGINS` if the API restricts origins.

## 5. Verify the installation

Check the API health endpoint:

```powershell
Invoke-WebRequest http://localhost:4000/api/v1/health
```

Build both applications:

```powershell
npm run build:api
npm run build:web
```

## Production-style start

Build both workspaces first:

```powershell
npm run build:api
npm run build:web
```

Start the API:

```powershell
npm --workspace apps/api run start
```

Start the web app in a second terminal:

```powershell
npm --workspace apps/web run start
```

For production, set `NODE_ENV=production`, use a strong unique `JWT_SECRET`, configure an explicit `CORS_ORIGINS` value, and use a managed PostgreSQL connection with appropriate backups and access controls.

## Common issues

### Port 4000 or 3000 is already in use

Stop the existing process or use the alternate port printed by the application. On Windows, inspect a port with:

```powershell
Get-NetTCPConnection -LocalPort 3000,4000 -ErrorAction SilentlyContinue
```

### Database connection fails

Check that PostgreSQL is running and that `DATABASE_URL` and `DIRECT_URL` contain the correct host, port, database, username, and password. Run Prisma commands from the repository root or the API workspace.

### Prisma client is out of date

Run:

```powershell
npm --workspace apps/api run prisma:generate
```

### Frontend dependency errors appear after changing branches

From the repository root, run:

```powershell
npm install
```

Then retry `npm run build:web`.
