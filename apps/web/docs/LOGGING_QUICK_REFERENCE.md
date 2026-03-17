# Logging Quick Reference

## Import

```typescript
import { logger } from "@/lib/utils/logger";
```

## Common Patterns

### 1. Error Logging
```typescript
try {
  // operation
} catch (error) {
  logger.error("Operation failed", error, { context: "value" });
}
```

### 2. Success Logging
```typescript
logger.info("Operation completed", { 
  userId: user.id,
  resourceId: resource.id 
});
```

### 3. Audit Trail
```typescript
logger.audit("action.name", userId, {
  resourceId: resource.id,
  changes: { field: "value" }
});
```

### 4. Performance Tracking
```typescript
const result = await logger.withTiming(
  "Operation name",
  () => expensiveOperation(),
  { operationType: "type" }
);
```

### 5. Request Logging (API Routes)
```typescript
export async function POST(request: NextRequest) {
  const start = Date.now();
  const user = await getCurrentUser();
  
  try {
    // ... handle request ...
    const duration = Date.now() - start;
    logger.request("POST", "/api/endpoint", 200, duration, {
      userId: user?.id
    });
    return Response.json({ success: true });
  } catch (error) {
    const duration = Date.now() - start;
    logger.request("POST", "/api/endpoint", 500, duration, {
      userId: user?.id
    });
    logger.error("API request failed", error);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
```

## Log Levels

| Level | When to Use | Production |
|-------|-------------|------------|
| `debug` | Detailed debugging info | ❌ Disabled |
| `info` | Important operational events | ✅ Enabled |
| `warn` | Potential issues | ✅ Enabled |
| `error` | Errors requiring attention | ✅ Enabled |

## What Gets Automatically Redacted

- `password`, `token`, `secret`, `apiKey`
- `accessToken`, `refreshToken`, `sessionToken`
- `authorization`, `auth`, `cookie`, `cookies`
- `emailVerificationToken`, `resetToken`, `verificationToken`
- Credit card numbers, SSNs, etc.

## Output Format

### Development
```
ℹ️ [INFO] User logged in { userId: '123', email: 'user@example.com' }
❌ [ERROR] Operation failed { operationId: '456' } Error: Something went wrong
```

### Production
```json
{"timestamp":"2024-01-01T12:00:00.000Z","level":"info","message":"User logged in","context":{"userId":"123","email":"user@example.com"}}
{"timestamp":"2024-01-01T12:00:01.000Z","level":"error","message":"Operation failed","context":{"operationId":"456"},"error":{"name":"Error","message":"Something went wrong"}}
```
