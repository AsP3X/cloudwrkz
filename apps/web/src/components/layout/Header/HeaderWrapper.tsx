import { Header } from "./Header";
import { isDatabaseAccessible } from "@/lib/utils/db-health";

export async function HeaderWrapper() {
  // Check database availability
  let databaseAvailable = true;
  try {
    databaseAvailable = await isDatabaseAccessible();
  } catch (error) {
    databaseAvailable = false;
    console.error("Database health check failed:", error);
  }

  return <Header databaseAvailable={databaseAvailable} />;
}
