import app from "./app";
import { logger } from "./lib/logger";
import { resolveDuePointApprovals } from "./routes/pairing";

// Fallback to port 5000 if process.env.PORT is not set
const rawPort = process.env.PORT || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bind specifically to '0.0.0.0' for Render
app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening on 0.0.0.0");
  const approvalTimer = setInterval(() => {
    void resolveDuePointApprovals().catch((error) =>
      logger.error({ err: error }, "Point approval sweep failed")
    );
  }, 15_000);
  approvalTimer.unref();
});