import { buildApp } from "./app.js";
import { getEnv } from "./config/env.js";
import 'dotenv/config'

const { port } = getEnv();
const app = await buildApp();

async function shutdown(signal) {
  app.log.info(`${signal} received, shutting down`);

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Error while shutting down");
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  app.log.error({ err: reason }, "Unhandled rejection");
});

process.on("uncaughtException", (error) => {
  app.log.error({ err: error }, "Uncaught exception");
  void shutdown("uncaughtException");
});

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });

  app.log.info(`Server listening on port ${port}`);
} catch (error) {
  app.log.error({ err: error }, "Failed to start server");
  process.exit(1);
}
