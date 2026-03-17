# Production Logging Recommendations

This document outlines the logging strategy and recommendations for the CloudWrkz production build.

## Overview

The application uses a centralized logger (`src/lib/utils/logger.ts`) that provides:
- Environment-aware logging (development vs production)
- Sensitive data filtering
- Structured logging format
- Performance tracking
- Error stack trace capture

## What to Log in Production

### ✅ Always Log (Error Level)

1. **Application Errors**
   - Unhandled exceptions
   - Database connection failures
   - Authentication failures
   - Authorization failures
   - Critical business logic errors

2. **System Errors**
   - Server crashes
   - Out of memory errors
   - Database query failures
   - External API failures

### ✅ Always Log (Info Level)

1. **Authentication Events**
   - User login/logout
   - Registration attempts
   - Password reset requests
   - Session creation/destruction
   - Failed login attempts (with rate limiting context)

2. **Data Mutations**
   - Ticket creation/updates/deletion
   - User account changes
   - Permission changes
   - Group management actions
   - Project creation/updates

3. **Important Business Events**
   - Time tracking start/stop
   - Payment processing (without sensitive data)
   - Account status changes (banned, suspended, etc.)
   - Email verification events

4. **Performance Metrics**
   - Slow database queries (>500ms)
   - Slow API endpoints (>1s)
   - Large data operations

### ⚠️ Log with Caution (Warn Level)

1. **Potential Issues**
   - Deprecated API usage
   - Missing optional data
   - Rate limiting triggers
   - Unusual user behavior patterns
   - Resource exhaustion warnings

2. **Configuration Issues**
   - Missing environment variables
   - Invalid configuration values
   - Feature flags in unexpected states

### 🔍 Debug Only (Development)

1. **Detailed Flow Information**
   - Function entry/exit
   - Variable values
   - State transitions
   - Component lifecycle events

2. **Development Helpers**
   - API request/response bodies
   - Database query details
   - Cache hits/misses

## What to Filter/Redact

### Sensitive Data (Automatically Filtered)

The logger automatically redacts the following fields:

- **Authentication Data**
  - `password`, `token`, `secret`, `apiKey`
  - `accessToken`, `refreshToken`, `sessionToken`
  - `authorization`, `auth`, `cookie`, `cookies`
  - `emailVerificationToken`, `resetToken`, `verificationToken`

- **Personal Information**
  - Credit card numbers
  - Social Security Numbers
  - Passport numbers

- **Session Data**
  - Session tokens
  - Cookie values

### Additional Recommendations

1. **User IDs**: Log user IDs for audit trails, but consider hashing for GDPR compliance in some regions
2. **Email Addresses**: Can be logged, but consider hashing for privacy-sensitive operations
3. **IP Addresses**: Log for security analysis, but consider anonymization for GDPR
4. **Request Bodies**: Sanitize before logging - remove sensitive fields
5. **Stack Traces**: Only include in development; summarize in production

## Log Levels by Environment

### Development
- **Debug**: ✅ Enabled (detailed debugging info)
- **Info**: ✅ Enabled (all operational events)
- **Warn**: ✅ Enabled (warnings and potential issues)
- **Error**: ✅ Enabled (all errors with full stack traces)

### Production
- **Debug**: ❌ Disabled (performance and privacy)
- **Info**: ✅ Enabled (important operational events)
- **Warn**: ✅ Enabled (warnings and potential issues)
- **Error**: ✅ Enabled (errors with summarized information)

## Usage Examples

### Basic Logging

```typescript
import { logger } from "@/lib/utils/logger";

// Info log
logger.info("User logged in", { userId: user.id, email: user.email });

// Error log
try {
  await someOperation();
} catch (error) {
  logger.error("Operation failed", error, { operationId: "123" });
}

// Warning log
if (unusualCondition) {
  logger.warn("Unusual condition detected", { condition: unusualCondition });
}
```

### Performance Tracking

```typescript
// Track operation duration
const result = await logger.withTiming(
  "Database query executed",
  async () => {
    return await prisma.user.findMany();
  },
  { query: "findMany", model: "User" }
);
```

### Audit Logging

```typescript
// Log user actions for audit trail
logger.audit("ticket.created", user.id, {
  ticketId: ticket.id,
  ticketNumber: ticket.ticketNumber,
  projectId: ticket.projectId,
});
```

### Request Logging

```typescript
// In API routes or middleware
const start = Date.now();
// ... handle request ...
const duration = Date.now() - start;
logger.request(req.method, req.path, res.statusCode, duration, {
  userId: user?.id,
  ip: req.ip,
});
```

## Migration Strategy

### Phase 1: Replace Critical Error Logs
1. Replace `console.error` in server actions with `logger.error`
2. Focus on authentication, authorization, and data mutations
3. Add context to error logs

### Phase 2: Add Info Logging
1. Add info logs for important business events
2. Add audit logs for user actions
3. Add performance tracking for slow operations

### Phase 3: Add Request Logging
1. Add middleware for API route logging
2. Track request/response times
3. Monitor error rates

### Phase 4: Production Monitoring
1. Set up log aggregation (CloudWatch, Datadog, etc.)
2. Configure alerts for error rates
3. Set up dashboards for key metrics

## Recommended External Services

For production, consider integrating with:

1. **Error Tracking**
   - Sentry (error tracking and monitoring)
   - Rollbar (error tracking)

2. **Log Aggregation**
   - AWS CloudWatch (if on AWS)
   - Datadog (comprehensive monitoring)
   - LogRocket (session replay + logging)
   - Papertrail (simple log aggregation)

3. **Performance Monitoring**
   - New Relic
   - Datadog APM
   - Next.js Analytics

## Security Considerations

1. **Never log**:
   - Plain text passwords
   - Full credit card numbers
   - Complete session tokens
   - API keys or secrets

2. **Be cautious with**:
   - User email addresses (GDPR)
   - IP addresses (GDPR)
   - Personal identifiers (GDPR)

3. **Log retention**:
   - Set appropriate retention periods
   - Comply with data protection regulations
   - Consider log encryption at rest

## Performance Considerations

1. **Async Logging**: Consider async logging for high-traffic scenarios
2. **Log Sampling**: For very high-volume logs, consider sampling
3. **Log Levels**: Use appropriate log levels to reduce noise
4. **Context Size**: Keep log context objects small

## Next Steps

1. ✅ Logger utility created
2. ⏳ Replace `console.error` calls with `logger.error`
3. ⏳ Add info/audit logging to critical operations
4. ⏳ Set up log aggregation service
5. ⏳ Configure alerts and monitoring
