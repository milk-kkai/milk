import { Pool } from "pg";
import { getEnv } from "../config/env.js";

const { databaseUrl, nodeEnv } = getEnv();
const isProduction = nodeEnv === "production";

let dbPool;

function getPool() {
  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  if (!dbPool) {
    dbPool = new Pool({
      connectionString: databaseUrl,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });

    dbPool.on("error", (error) => {
      process.emitWarning(`Unexpected PostgreSQL pool error: ${error.message}`);
    });
  }

  return dbPool;
}

export function getDatabasePool() {
  return getPool();
}

export async function query(text, params = []) {
  try {
    const pool = getPool();
    return await pool.query(text, params);
  } catch (error) {
    throw new Error("PostgreSQL query failed", { cause: error });
  }
}

export async function checkDatabaseConnection() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT 1");
  } catch (error) {
    throw new Error("PostgreSQL connection check failed", { cause: error });
  } finally {
    client.release();
  }
}

export async function closeDatabasePool() {
  if (dbPool) {
    await dbPool.end();
    dbPool = undefined;
  }
}
