import dotenv from "dotenv";


dotenv.config();

const DEFAULT_PORT = 3000;

function parsePort(value) {
  const port = Number(value);

  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  return DEFAULT_PORT;
}

function parseDatabaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function getEnv() {
  return {
    port: parsePort(process.env.PORT),
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: parseDatabaseUrl(process.env.DATABASE_URL),
  };
}
