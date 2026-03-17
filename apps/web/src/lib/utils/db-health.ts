import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma";

export type DatabaseHealthStatus = {
  status: "healthy" | "unhealthy" | "degraded";
  connected: boolean;
  responseTime?: number;
  error?: string;
  droppedConnections?: number;
  activeConnections?: number;
  maxConnections?: number;
  databaseSize?: string;
  lastChecked: Date;
};

/**
 * Check if an error is a database connection error
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error) return false;
  
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("can't reach database server") ||
      message.includes("connection refused") ||
      message.includes("connection timeout") ||
      message.includes("connection closed") ||
      message.includes("database server") ||
      message.includes("p1001") || // Prisma connection error code
      message.includes("p1002") || // Prisma connection timeout
      message.includes("p1003") || // Prisma database not found
      message.includes("p1017")    // Prisma server closed connection
    );
  }
  
  return false;
}

/**
 * Format database errors into user-friendly messages
 * Removes technical details and provides clear, actionable error messages
 * Prioritizes server unreachable errors over database connection errors
 */
export function formatDatabaseError(error: unknown, isServerUnreachable: boolean = false): string {
  if (!error) {
    return isServerUnreachable 
      ? "Server is unreachable - unable to connect to the service"
      : "Unable to connect to the database";
  }

  // Handle Prisma-specific errors (these are database errors, not server errors)
  if (error instanceof Prisma.PrismaClientInitializationError) {
    const code = error.errorCode;
    const message = error.message.toLowerCase();

    // Check for specific error codes
    if (code === "P1001" || message.includes("can't reach database server")) {
      return "Database server is unreachable. Please check if the database service is running.";
    }
    if (code === "P1002" || message.includes("connection timeout")) {
      return "Database connection timed out. The server may be overloaded or unreachable.";
    }
    if (code === "P1003" || message.includes("database") && message.includes("not found")) {
      return "Database not found. Please verify the database configuration.";
    }
    if (code === "P1017" || message.includes("server closed connection")) {
      return "Database server closed the connection. Please try again.";
    }
    if (message.includes("connection refused")) {
      return "Database connection refused. Please check if the database service is running.";
    }
    if (message.includes("authentication failed") || message.includes("password")) {
      return "Database authentication failed. Please verify the database credentials.";
    }
    
    // Generic Prisma initialization error
    return "Database connection failed. Please check the database configuration and ensure the service is running.";
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Prioritize server unreachable errors
    if (isServerUnreachable || 
        message.includes("failed to fetch") || 
        message.includes("network error") ||
        (message.includes("fetch") && (message.includes("failed") || message.includes("network")))) {
      return "Server is unreachable - unable to connect to the service";
    }

    // Remove technical details like host:port from error messages
    if (message.includes("can't reach database server") || message.includes("localhost:5432")) {
      return "Database server is unreachable. Please check if the database service is running.";
    }
    if (message.includes("connection refused")) {
      return "Database connection refused. Please check if the database service is running.";
    }
    if (message.includes("connection timeout") || message.includes("timeout")) {
      return "Database connection timed out. The server may be overloaded or unreachable.";
    }
    if (message.includes("connection closed")) {
      return "Database connection was closed. Please try again.";
    }
    if (message.includes("authentication failed") || message.includes("password")) {
      return "Database authentication failed. Please verify the database credentials.";
    }
    if (message.includes("database") && message.includes("not found")) {
      return "Database not found. Please verify the database configuration.";
    }
    if (message.includes("network") || message.includes("econnrefused")) {
      return "Network error connecting to database. Please check your network connection and database server status.";
    }

    // For other errors, provide a generic message without exposing technical details
    // Log the original error for debugging purposes
    console.error("Database error:", error);
    return isServerUnreachable
      ? "Server is unreachable - unable to connect to the service"
      : "Unable to connect to the database. Please check the database service status.";
  }

  // Fallback for unknown error types
  console.error("Unknown database error:", error);
  return isServerUnreachable
    ? "Server is unreachable - unable to connect to the service"
    : "An unexpected error occurred while connecting to the database.";
}

/**
 * Check database health and connection status
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const startTime = Date.now();
  const result: DatabaseHealthStatus = {
    status: "unhealthy",
    connected: false,
    lastChecked: new Date(),
  };

  try {
    // Simple query to test connection
    await prisma.$queryRaw`SELECT 1 as health_check`;
    
    const responseTime = Date.now() - startTime;
    result.connected = true;
    result.responseTime = responseTime;
    result.status = responseTime > 1000 ? "degraded" : "healthy";

    // Try to get connection statistics (PostgreSQL specific)
    try {
      const stats = await prisma.$queryRaw<Array<{
        active_connections: bigint;
        max_connections: bigint;
        numbackends: bigint;
      }>>`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          (SELECT numbackends FROM pg_stat_database WHERE datname = current_database()) as numbackends
      `;

      if (stats && stats.length > 0) {
        result.activeConnections = Number(stats[0].active_connections);
        result.maxConnections = Number(stats[0].max_connections);
        // Note: PostgreSQL doesn't directly track "dropped connections" in a simple way
        // We can calculate approximate dropped connections from connection stats if needed
        // For now, we'll leave it undefined or set to 0
        result.droppedConnections = 0;
      }

      // Get database size
      const sizeResult = await prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;
      
      if (sizeResult && sizeResult.length > 0) {
        result.databaseSize = sizeResult[0].size;
      }
    } catch (statsError) {
      // If we can't get stats, that's okay - connection is still working
      console.warn("Could not fetch database statistics:", statsError);
    }

    return result;
  } catch (error) {
    result.connected = false;
    result.status = "unhealthy";
    result.responseTime = Date.now() - startTime;
    
    // Format error message to be user-friendly
    result.error = formatDatabaseError(error);

    return result;
  }
}

/**
 * Check if database is currently accessible
 */
export async function isDatabaseAccessible(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    return false;
  }
}
