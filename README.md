# CloudWrkz

A modern Next.js 16 application with Tailwind CSS, PostgreSQL, and a built-in CLI and Docker image.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 3.x
- **Database**: PostgreSQL with Prisma ORM
- **Type Safety**: TypeScript
- **Package Manager**: pnpm (via Corepack)

## Prerequisites

- **Node.js**: >= 25.2.0 (see `.nvmrc` for recommended version)
- **pnpm**: managed via Corepack (recommended)  
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **Docker & Docker Compose**: for local PostgreSQL (and optional devcontainer)

## Getting Started (Local Development)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start PostgreSQL Database

Using Docker Compose:

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database on port `5432`
- pgAdmin (optional database management UI) on port `5050`

To stop the database:
```bash
docker-compose down
```

To stop and remove volumes (⚠️ deletes all data):
```bash
docker-compose down -v
```

### 3. Environment Setup

The `.env.local` file is already configured for Docker Compose. If you need to customize:

```bash
cp .env.example .env.local
```

Update `.env.local` with your settings.

### 4. Database Setup & Migration

You can either use the **helper scripts** or run Prisma commands directly.

#### Option A: Helper scripts (recommended)

1. Run the database setup script (creates DB, user, grants permissions, and shows the connection string):

```bash
bash scripts/setup-db.sh
```

2. Copy the printed `DATABASE_URL` into your `.env.local` (if not already set).

3. Verify the database and schema:

```bash
bash scripts/verify-db.sh
```

#### Option B: Manual Prisma commands

Generate Prisma Client:
```bash
pnpm db:generate
```

Push the database schema:
```bash
pnpm db:push
```

Or create a migration:
```bash
pnpm db:migrate
```

### 5. Development

Run the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Management

### Access pgAdmin

1. Start docker-compose: `docker-compose up -d`
2. Open [http://localhost:5050](http://localhost:5050)
3. Login with:
   - Email: `admin@cloudwrkz.local`
   - Password: `admin`
4. Add server:
   - Host: `postgres` (or `localhost` if connecting from host)
   - Port: `5432`
   - Database: `cloudwrkz`
   - Username: `cloudwrkz`
   - Password: `cloudwrkz_dev_password`

### Database Commands

- Generate Prisma Client: `pnpm db:generate`
- Push schema changes: `pnpm db:push`
- Create migration: `pnpm db:migrate`
- Open Prisma Studio: `pnpm db:studio`

### Direct PostgreSQL Access

```bash
# Connect via Docker
docker exec -it cloudwrkz-postgres psql -U cloudwrkz -d cloudwrkz

# Or connect from host (if psql is installed)
psql -h localhost -U cloudwrkz -d cloudwrkz
# Password: cloudwrkz_dev_password
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # Modular React components
│   ├── ui/          # Base UI components
│   ├── layout/      # Layout components
│   └── features/    # Feature-specific components
├── lib/             # Utilities and helpers
│   ├── db/          # Database client
│   └── utils/       # Utility functions
└── server/          # Server-side code
    └── actions/     # Server Actions
```

## Docker Compose Services

- **postgres**: PostgreSQL 16 database
  - Port: `5432`
  - User: `cloudwrkz`
  - Password: `cloudwrkz_dev_password`
  - Database: `cloudwrkz`

- **pgadmin**: Database management UI (optional)
  - Port: `5050`
  - Email: `admin@cloudwrkz.local`
  - Password: `admin`

## CloudWrkz CLI

The project includes a CLI for managing users and modules.

- **Run the CLI**:

```bash
pnpm cli <category> <command> [options]
```

See `CLI.md` for full command reference and workflows.

## Running via Docker Image (optional)

The GitHub Actions workflow builds and publishes Docker images to GitHub Container Registry (GHCR) under:

- `ghcr.io/<owner>/<repo>:latest` (for `master`)
- `ghcr.io/<owner>/<repo>:preview` (for `dev`)
- `ghcr.io/<owner>/<repo>:<branch>-<short_sha>` (for feature branches/PRs)

To run the app from a published image (assuming a PostgreSQL instance is reachable):

```bash
docker run --rm \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://cloudwrkz:cloudwrkz_dev_password@host.docker.internal:5432/cloudwrkz?schema=public" \
  ghcr.io/<owner>/<repo>:preview
```

Adjust the tag and `DATABASE_URL` to match your environment.

## Design System

The project uses a custom design system built on Tailwind CSS with:
- Soft, enterprise-friendly color palette
- Modular component architecture
- Smooth animations and transitions
- Responsive design patterns

## License

PROPRIETARY
