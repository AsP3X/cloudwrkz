import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Migrating existing time entries...");

  // Get all existing time entries
  const entries = await prisma.$queryRaw<Array<{
    id: string;
    description: string | null;
    duration: number;
    status: string;
    startedAt: Date;
    stoppedAt: Date | null;
    pausedAt: Date | null;
    pausedDuration: number;
  }>>`
    SELECT id, description, duration, status, "startedAt", "stoppedAt", "pausedAt", "pausedDuration"
    FROM time_entries
  `;

  console.log(`Found ${entries.length} entries to migrate`);

  for (const entry of entries) {
    // Generate name from description or use a default
    const name = entry.description || `Timer-${entry.id.substring(0, 8)}`;
    
    // Map old status to new status
    let newStatus = "STOPPED";
    if (entry.status === "ACTIVE" && !entry.stoppedAt) {
      newStatus = "RUNNING";
    } else if (entry.status === "PAUSED") {
      newStatus = "PAUSED";
    } else if (entry.status === "COMPLETED") {
      newStatus = "COMPLETED";
    }

    // Calculate totalDuration (duration + pausedDuration)
    const totalDuration = (entry.duration || 0) + (entry.pausedDuration || 0);

    // Set lastResumedAt for running entries
    const lastResumedAt = newStatus === "RUNNING" ? entry.startedAt : null;

    // Update the entry using raw SQL to handle the enum change
    await prisma.$executeRaw`
      UPDATE time_entries
      SET 
        name = ${name},
        "totalDuration" = ${totalDuration},
        "lastResumedAt" = ${lastResumedAt},
        "stoppedAt" = ${entry.stoppedAt || null},
        "completedAt" = ${newStatus === "COMPLETED" ? (entry.stoppedAt || new Date()) : null},
        status = ${newStatus}::text
      WHERE id = ${entry.id}
    `;

    console.log(`Migrated entry ${entry.id}: ${name} (${newStatus})`);
  }

  console.log("Migration complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
