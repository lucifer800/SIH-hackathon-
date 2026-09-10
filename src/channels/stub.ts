import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { render } from "../i18n/templates.js";
import { maskMobile } from "../lib/mobile.js";
import type { Channel, SendRequest, SendResult } from "./types.js";

/**
 * Writes a real `messages` row and logs the body instead of paying a vendor.
 *
 * This is what makes L1 through L4 runnable and demoable with no SMS account and
 * no DLT paperwork: the alerts screen, the delivery states and the message
 * history are all genuine — only the radio is missing.
 */
export class StubChannel implements Channel {
  readonly name = "stub";

  async send(req: SendRequest): Promise<SendResult> {
    const rendered = render(req.templateId, req.language, req.vars);
    const now = new Date();

    const [row] = await db
      .insert(t.messages)
      .values({
        userId: req.userId,
        channel: req.channel ?? "sms",
        templateId: rendered.templateId,
        language: rendered.language,
        category: rendered.category,
        body: rendered.body,
        status: "delivered",
        providerId: null,
        sentAt: now,
        deliveredAt: now,
      })
      .returning();

    // eslint-disable-next-line no-console
    console.log(`[sms:stub → ${maskMobile(req.to)}] ${rendered.body}`);

    return { messageId: row!.id, providerId: null, body: rendered.body, preview: rendered.body };
  }
}
