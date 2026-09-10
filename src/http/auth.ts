import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "../db/schema.js";
import { forbidden, unauthorized } from "./errors.js";
import type { AccessPayload } from "../modules/auth/service.js";

/**
 * `preHandler` that turns a bearer token into `request.auth`.
 *
 * Deliberately does not hit the database: the access token is short-lived
 * (15 minutes) and a farmer on a 2G connection should not pay a round trip on
 * every request. Role changes and revocations take effect at the next refresh.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const payload = await request.jwtVerify<AccessPayload>();
    request.auth = { userId: payload.sub, role: payload.role as Role, language: payload.lang };
  } catch {
    throw unauthorized("Please sign in to continue.");
  }
}

/** Route guard: `preHandler: [authenticate, requireRole("operator", "admin")]`. */
export function requireRole(...roles: Role[]) {
  return async function guard(request: FastifyRequest) {
    if (!request.auth) throw unauthorized();
    if (!roles.includes(request.auth.role)) {
      throw forbidden("This is only available to centre staff.");
    }
  };
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: { userId: string; role: Role; language: "pa" | "hi" | "en" };
  }
}
