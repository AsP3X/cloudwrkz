import { NextResponse } from "next/server";
import { checkDatabaseHealth, formatDatabaseError } from "@/lib/utils/db-health";

/**
 * Health check endpoint - publicly accessible
 * Returns the health status of various services
 */
export async function GET() {
  try {
    const dbHealth = await checkDatabaseHealth();

    const overallStatus = dbHealth.status === "healthy" ? "healthy" : 
                         dbHealth.status === "degraded" ? "degraded" : "unhealthy";

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealth.status,
          connected: dbHealth.connected,
          responseTime: dbHealth.responseTime,
          error: dbHealth.error,
          activeConnections: dbHealth.activeConnections,
          maxConnections: dbHealth.maxConnections,
          droppedConnections: dbHealth.droppedConnections,
          databaseSize: dbHealth.databaseSize,
          lastChecked: dbHealth.lastChecked.toISOString(),
        },
      },
    }, {
      status: overallStatus === "healthy" ? 200 : 
              overallStatus === "degraded" ? 200 : 503,
    });
  } catch (error) {
    // Format error message to be user-friendly
    const errorMessage = formatDatabaseError(error);
    
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: errorMessage,
      services: {
        database: {
          status: "unhealthy",
          connected: false,
          error: errorMessage,
        },
      },
    }, {
      status: 503,
    });
  }
}
