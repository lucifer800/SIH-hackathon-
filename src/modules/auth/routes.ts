import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AUTH_POLICY, logout, meWithHolding, requestOtp, rotateRefresh, updateMe, verifyOtp } from "./service.js";
import { authenticate } from "../../http/auth.js";
import { InvalidMobileError } from "../../lib/mobile.js";
import { unprocessable } from "../../http/errors.js";
import type { AccessPayload } from "./service.js";

const langSchema = z.enum(["pa", "hi", "en"]);

const otpRequestBody = z.object({
  // The app sends 10 digits; SMS and IVR webhooks send +91… — both normalise here.
  mobile: z.string().min(10).max(20),
});

const otpVerifyBody = z.object({
  requestId: z.string().uuid(),
  code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code."),
  language: langSchema.optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

const refreshBody = z.object({ refreshToken: z.string().min(10) });

const patchMeBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  language: langSchema.optional(),
});

export async function authRoutes(app: FastifyInstance) {
  const signAccess = (payload: AccessPayload) =>
    app.jwt.sign(payload, { expiresIn: `${AUTH_POLICY.accessTtlMinutes}m` });

  app.post(
    "/api/v1/auth/otp/request",
    {
      // Second limit, by IP. The per-mobile limit lives in the service, because
      // it must survive a restart; this one only has to stop a flood.
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const body = otpRequestBody.parse(request.body);
      try {
        return reply.send(await requestOtp(body.mobile));
      } catch (error) {
        if (error instanceof InvalidMobileError) {
          throw unprocessable("MOBILE_INVALID", error.message);
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/v1/auth/otp/verify",
    { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const body = otpVerifyBody.parse(request.body);
      const session = await verifyOtp(
        body.requestId,
        body.code,
        { language: body.language, name: body.name },
        signAccess,
      );
      return reply.status(session.isNewUser ? 201 : 200).send(session);
    },
  );

  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const body = refreshBody.parse(request.body);
    return reply.send(await rotateRefresh(body.refreshToken, signAccess));
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const body = refreshBody.partial().parse(request.body ?? {});
    if (body.refreshToken) await logout(body.refreshToken);
    return reply.send({ message: "Signed out." });
  });

  app.get("/api/v1/me", { preHandler: [authenticate] }, async (request) =>
    meWithHolding(request.auth!.userId),
  );

  app.patch("/api/v1/me", { preHandler: [authenticate] }, async (request) => {
    const body = patchMeBody.parse(request.body);
    return { user: await updateMe(request.auth!.userId, body) };
  });
}
