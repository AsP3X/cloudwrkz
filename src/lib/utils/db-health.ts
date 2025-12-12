import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

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
    
    if (error instanceof Error) {
      result.error = error.message;
    } else {
      result.error = "Unknown database error";
    }

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
