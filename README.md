# CloudWrkz

A modern Next.js 15 application with Tailwind CSS and PostgreSQL.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS 3.x
- **Database**: PostgreSQL with Prisma ORM
- **Type Safety**: TypeScript
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm installed (`npm install -g pnpm`)
- PostgreSQL database

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Copy the environment file:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your database connection string:
```
DATABASE_URL="postgresql://user:password@localhost:5432/cloudwrkz?schema=public"
```

4. Generate Prisma Client:
```bash
pnpm db:generate
```

5. Push the database schema:
```bash
pnpm db:push
```

### Development

Run the development server:
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Database Commands

- Generate Prisma Client: `pnpm db:generate`
- Push schema changes: `pnpm db:push`
- Create migration: `pnpm db:migrate`
- Open Prisma Studio: `pnpm db:studio`

### Project Structure

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
└── types/           # TypeScript type definitions
```

## Design System

The project uses a custom design system built on Tailwind CSS with:
- Soft, enterprise-friendly color palette
- Modular component architecture
- Smooth animations and transitions
- Responsive design patterns

## License

MIT
