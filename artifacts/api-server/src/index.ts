import express from "express";
import helmet from "helmet";
import cors from "cors";
import app from "./app";
import { logger } from "./lib/logger";
import { dispatchPendingPairingPush } from "./lib/web-push";
import { resolveDuePointApprovals } from "./routes/pairing";

// 1. Security Middlewares (Helmet, Strict CORS, Body Limits)
app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// Root route handler (Serves https://rasedison.onrender.com/)
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "API Server is running" });
});

// 2. Dynamic PORT Assignment & Validation
const rawPort = process.env.PORT || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  logger.error({ rawPort }, "Invalid PORT provided");
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// 3. Bind Server to 0.0.0.0 for Render Routing
const server = app.listen(port, "0.0.0.0", (err?: Error) => {
  if (err) {
    logger.error({ err }, "Fatal: Error starting server");
    process.exit(1);
  }

  logger.info({ port }, "Server running securely on 0.0.0.0");

  const approvalTimer = setInterval(() => {
    void resolveDuePointApprovals().catch((error) =>
      logger.error({ err: error }, "Point approval sweep failed")
    );
  }, 15_000);
  const pushTimer = setInterval(() => {
    void dispatchPendingPairingPush().catch((error) =>
      logger.error({ err: error }, "Browser alert delivery sweep failed")
    );
  }, 10_000);

  approvalTimer.unref();
  pushTimer.unref();
});

// 4. Graceful Shutdown Handlers
const shutdown = (signal: string) => {
  logger.info({ signal }, "Received shutdown signal. Closing HTTP server...");
  server.close(() => {
    logger.info("HTTP server closed cleanly.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));