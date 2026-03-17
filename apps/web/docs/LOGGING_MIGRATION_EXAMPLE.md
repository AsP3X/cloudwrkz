# Logging Migration Example

This document shows how to migrate from `console.error`/`console.log` to the new logger.

## Before (Current Code)

```typescript
// src/server/actions/auth.ts
try {
  // ... registration logic ...
} catch (error) {
  console.error("Registration error:", error);
  // ... error handling ...
}
```

## After (With Logger)

```typescript
import { logger } from "@/lib/utils/logger";

// src/server/actions/auth.ts
try {
  // ... registration logic ...
  logger.info("User registered successfully", {
    userId: user.id,
    email: user.email,
  });
} catch (error) {
  logger.error("Registration error", error, {
    email: input.email,
    // Note: password is automatically redacted if present
  });
  // ... error handling ...
}
```

## Migration Patterns

### 1. Error Logging

**Before:**
```typescript
console.error("Create ticket error:", error);
```

**After:**
```typescript
logger.error("Create ticket error", error, {
  ticketId: ticket?.id,
  userId: user.id,
  action: "createTicket",
});
```

### 2. Info Logging

**Before:**
```typescript
// No logging for successful operations
```

**After:**
```typescript
logger.info("Ticket created successfully", {
  ticketId: ticket.id,
  ticketNumber: ticket.ticketNumber,
  userId: user.id,
});

// Or use audit logging for important user actions
logger.audit("ticket.created", user.id, {
  ticketId: ticket.id,
  ticketNumber: ticket.ticketNumber,
});
```

### 3. Performance Tracking

**Before:**
```typescript
const start = Date.now();
const result = await expensiveOperation();
const duration = Date.now() - start;
if (duration > 1000) {
  console.warn(`Slow operation: ${duration}ms`);
}
```

**After:**
```typescript
const result = await logger.withTiming(
  "Expensive operation completed",
  () => expensiveOperation(),
  { operationType: "dataProcessing" }
);
// Automatically logs duration and warns if slow
```

### 4. Authentication Events

**Before:**
```typescript
console.error("Login error:", error);
```

**After:**
```typescript
// On successful login
logger.info("User logged in", {
  userId: user.id,
  email: user.email,
  ip: request.ip, // if available
});

// On failed login
logger.warn("Login failed", undefined, {
  email: input.email,
  reason: "invalid_credentials",
  ip: request.ip,
});

// On error
logger.error("Login error", error, {
  email: input.email,
  // password is automatically redacted
});
```

### 5. Database Operations

**Before:**
```typescript
try {
  const user = await prisma.user.findUnique({ where: { id } });
} catch (error) {
  console.error("Database error:", error);
}
```

**After:**
```typescript
try {
  const user = await logger.withTiming(
    "Database query: findUser",
    () => prisma.user.findUnique({ where: { id } }),
    { userId: id, operation: "findUnique", model: "User" }
  );
} catch (error) {
  logger.error("Database query failed", error, {
    operation: "findUnique",
    model: "User",
    userId: id,
  });
}
```

## Priority Migration Order

1. **High Priority** (Security & Critical Operations)
   - Authentication actions (`src/server/actions/auth.ts`)
   - Authorization checks (`src/lib/utils/auth-server.ts`)
   - User management (`src/server/actions/users.ts`)
   - Admin actions (`src/server/actions/admin/*`)

2. **Medium Priority** (Business Logic)
   - Ticket operations (`src/server/actions/tickets.ts`)
   - Project operations (`src/server/actions/projects.ts`)
   - Time tracking (`src/server/actions/time-tracking.ts`)

3. **Low Priority** (UI & Client-side)
   - Client-side error handling
   - Component lifecycle events
   - User interactions (if needed for debugging)

## Quick Migration Script

You can use find/replace with regex to help with migration:

**Find:** `console\.error\(([^,]+),\s*(error|err)\)`
**Replace:** `logger.error($1, $2, {})`

Then manually add context to the empty object `{}`.

**Note:** Always review and add appropriate context after automated replacement.
