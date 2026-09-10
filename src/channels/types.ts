import type { Lang } from "../db/schema.js";
import type { TemplateId } from "../i18n/templates.js";

export interface SendRequest {
  userId: string;
  to: string;
  templateId: TemplateId;
  language: Lang;
  vars: Record<string, string | number>;
  channel?: "sms" | "ivr" | "push" | "in_app";
}

export interface SendResult {
  messageId: string;
  providerId: string | null;
  body: string;
  /** Dev only: the stub surfaces the rendered body so a demo needs no phone. */
  preview?: string;
}

/**
 * One interface, three implementations (stub, DLT SMS, IVR).
 *
 * Contract: the `messages` row is written BEFORE the provider call, and is never
 * rolled back if the provider fails — only marked `failed`. The alerts screen
 * promises "nothing is lost", and a message that vanished because a vendor was
 * down would break that promise silently.
 */
export interface Channel {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
}
