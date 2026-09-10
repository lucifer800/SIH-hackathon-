import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import underPressure from "@fastify/under-pressure";
import jwt from "@fastify/jwt";
import { ZodError } from "zod";
import { env } from "./env.js";
import { AppError } from "./http/errors.js";
import { db, sql } from "./db/client.js";
import { authRoutes } from "./modules/auth/routes.js";
import { centreRoutes } from "./modules/centres/routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { queueRoutes } from "./modules/queue/routes.js";
import { lotRoutes } from "./modules/lots/routes.js";
import { paymentRoutes } from "./modules/payments/routes.js";
import { messageRoutes } from "./modules/messages/routes.js";
import { rateRoutes } from "./modules/rates/routes.js";
import { assistRoutes } from "./modules/assist/routes.js";
import { districtRoutes } from "./modules/district/routes.js";
import { disruptionRoutes } from "./modules/disruption/routes.js";
import { syncRoutes } from "./modules/sync/routes.js";
import { grievanceRoutes } from "./modules/grievances/routes.js";
import { maintenanceRoutes } from "./modules/maintenance/routes.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import { FAIRNESS_RULES } from "./domain/fairness.js";
import { IMPACT_TARGETS } from "./domain/impact.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1_000_000,
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  // The prototype shipped `Access-Control-Allow-Origin: *` on a bearer-token API.
  // This is where that gets replaced with an explicit list.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : false,
    credentials: true,
  });

  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 700_000_000,
    message: "The centre server is busy. Please try again in a moment.",
    retryAfter: 5,
    exposeStatusRoute: "/api/v1/health/pressure",
  });

  await app.register(rateLimit, {
    global: false,
    max: 100,
    timeWindow: "1 minute",
    // In tests the whole file shares one fake IP; the per-mobile limit in the
    // auth service is the one that actually protects the OTP endpoint.
    allowList: () => env.NODE_ENV === "test",
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { iss: "kisanq" },
    verify: { allowedIss: "kisanq" },
  });

  app.decorate("db", db);

  app.setErrorHandler((err, request, reply) => {
    const error = err as FastifyError;
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
        requestId: request.id,
      });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "Check the highlighted fields and try again.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        requestId: request.id,
      });
    }
    if (error.validation) {
      return reply.status(422).send({
        error: { code: "VALIDATION_FAILED", message: error.message, details: error.validation },
        requestId: request.id,
      });
    }

    request.log.error({ err: error }, "unhandled error");
    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.status(statusCode).send({
      error: {
        code: "INTERNAL",
        message:
          statusCode === 500 ? "Something went wrong on our side. Please try again." : error.message,
      },
      requestId: request.id,
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: "NOT_FOUND", message: `No route for ${request.method} ${request.url}.` },
      requestId: request.id,
    }),
  );

  // Registered after setErrorHandler on purpose: a plugin resolves its error
  // handler at registration time, so routes added earlier would fall through to
  // Fastify's default envelope instead of ours.
  await app.register(authRoutes);
  await app.register(centreRoutes);
  await app.register(bookingRoutes);
  await app.register(queueRoutes);
  await app.register(lotRoutes);
  await app.register(paymentRoutes);
  await app.register(messageRoutes);
  await app.register(rateRoutes);
  await app.register(assistRoutes);
  await app.register(districtRoutes);
  await app.register(disruptionRoutes);
  await app.register(syncRoutes);
  await app.register(grievanceRoutes);
  await app.register(maintenanceRoutes);
  await app.register(dashboardRoutes);

  app.get("/api/v1/health", async () => ({
    status: "ok",
    level: "L6",
    uptimeSec: Math.round(process.uptime()),
  }));

  /**
   * The deck promises "published fairness rules" as the answer to farmers not
   * trusting an algorithm. Publishing them means serving them, unauthenticated,
   * from the same constants the booking engine actually uses — so the rules on
   * the page can never drift from the rules in the code.
   */
  app.get("/api/v1/public/rules", async () => ({
    ordering: "Your place is set by your slot window, then by when you checked in at the gate. Arriving late puts you at the back of your own window, never at the back of the day.",
    rules: FAIRNESS_RULES,
    targets: IMPACT_TARGETS,
    sourceOfTruth: "These values are read directly by the booking and queue engines.",
  }));

  app.get("/api/v1/health/deep", async () => {
    const started = Date.now();
    await sql`select 1`;
    return { status: "ok", db: "up", dbLatencyMs: Date.now() - started };
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    db: typeof db;
  }
}
