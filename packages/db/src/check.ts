import { createDayliDatabase, proveDatabaseConnection } from "./index";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to run the local PostgreSQL smoke check.");
  process.exitCode = 1;
} else {
  const database = createDayliDatabase(connectionString);

  try {
    await proveDatabaseConnection(database.db);
    console.log("PostgreSQL smoke query succeeded.");
  } catch {
    console.error("PostgreSQL smoke query failed.");
    process.exitCode = 1;
  } finally {
    await database.close();
  }
}
