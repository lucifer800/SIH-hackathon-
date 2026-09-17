import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { env } from "../env.js";
import { render } from "../i18n/templates.js";
import { maskMobile } from "../lib/mobile.js";
import type { Channel, SendRequest, SendResult } from "./types.js";

/**
 * Live SMS over Fast2SMS (free tier, India-native).
 * Same contract as the stub: the `messages` row is written first, then the provider call;
 * a provider failure marks the row `failed` but never loses it.
 *
 * Fast2SMS is free, no template registration needed, instant API key.
 * Works immediately after signup at https://www.fast2sms.com
 */
export class Fast2smsChannel implements Channel {
  readonly name = "fast2sms";

  async send(req: SendRequest): Promise<SendResult> {
    const rendered = render(req.templateId, req.language, req.vars);
    const [row] = await db.insert(t.messages).values({
      userId: req.userId, channel: req.channel ?? "sms", templateId: rendered.templateId,
      language: rendered.language, category: rendered.category, body: rendered.body, status: "queued",
    }).returning();

    try {
      const res = await fetch("https://www.fast2sms.com/dev/bulksms", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: env.FAST2SMS_API_KEY ?? "" },
        body: JSON.stringify({
          route: "p",
          numbers: req.to.replace(/^\+91/, "").replace(/[^\d]/g, ""),
          message: rendered.body,
        }),
      });
      const ok = res.ok;
      const json = ok ? ((await res.json().catch(() => ({}))) as { request_id?: string }) : {};
      const providerId = ok ? String(json.request_id ?? "") : null;
      await db.update(t.messages)
        .set({ status: ok ? "sent" : "failed", providerId, sentAt: ok ? new Date() : null })
        .where(eq(t.messages.id, row!.id));
      return { messageId: row!.id, providerId, body: rendered.body };
    } catch {
      await db.update(t.messages).set({ status: "failed" }).where(eq(t.messages.id, row!.id));
      // eslint-disable-next-line no-console
      console.error(`[sms:fast2sms → ${maskMobile(req.to)}] send failed`);
      return { messageId: row!.id, providerId: null, body: rendered.body };
    }
  }
}
