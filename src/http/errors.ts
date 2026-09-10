/**
 * One error shape for the whole API:
 *   { error: { code, message, details? }, requestId }
 *
 * `code` is a stable machine string the front end can switch on
 * (SLOT_FULL, OTP_INVALID, ...). `message` is for humans and is the
 * only field that gets translated.
 */
export class AppError extends Error {
  /** A deterministic refusal (same input → same refusal) may be cached by idempotency. */
  cacheable = false;

  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  asCacheable(): this {
    this.cacheable = true;
    return this;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = "Please sign in to continue.") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (entity: string) =>
  new AppError(404, "NOT_FOUND", `${entity} not found.`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
export const tooManyRequests = (message: string, details?: unknown) =>
  new AppError(429, "RATE_LIMITED", message, details);
