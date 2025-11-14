# CloudWrkz

A modern Next.js 15 application with Tailwind CSS and PostgreSQL.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 3.x
- **Database**: PostgreSQL with Prisma ORM
- **Type Safety**: TypeScript
- **Package Manager**: pnpm

## Prerequisites

- Node.js 18+ 
- pnpm installed (`npm install -g pnpm`)
- Docker and Docker Compose (for database)

## Getting Started

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

### 4. Database Migration

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

## Design System

The project uses a custom design system built on Tailwind CSS with:
- Soft, enterprise-friendly color palette
- Modular component architecture
- Smooth animations and transitions
- Responsive design patterns

## License

MIT
