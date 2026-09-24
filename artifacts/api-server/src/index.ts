import app from "./app";
import { logger } from "./lib/logger";
import { resolveDuePointApprovals } from "./routes/pairing";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  const approvalTimer = setInterval(() => {
    void resolveDuePointApprovals().catch((error) => logger.error({ err: error }, "Point approval sweep failed"));
  }, 15_000);
  approvalTimer.unref();
});
