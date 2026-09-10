import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import * as t from "../db/schema.js";
import { env } from "../env.js";
import { render } from "../i18n/templates.js";
import { maskMobile } from "../lib/mobile.js";
import type { Channel, SendRequest, SendResult } from "./types.js";

/**
 * Live SMS over MSG91 (Indian DLT-compliant A2P). Same contract as the stub: the
 * `messages` row is written first, then the provider call; a provider failure marks
 * the row `failed` but never loses it.
 *
 * DLT requires each template registered in advance with a template id; those ids
 * map from our TemplateId once approved. Until then this driver is inert unless
 * CHANNEL_DRIVER=msg91 and SMS_API_KEY are both set.
 */
export class Msg91Channel implements Channel {
  readonly name = "msg91";

  async send(req: SendRequest): Promise<SendResult> {
    const rendered = render(req.templateId, req.language, req.vars);
    const [row] = await db.insert(t.messages).values({
      userId: req.userId, channel: req.channel ?? "sms", templateId: rendered.templateId,
      language: rendered.language, category: rendered.category, body: rendered.body, status: "queued",
    }).returning();

    try {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: env.SMS_API_KEY ?? "" },
        body: JSON.stringify({ mobiles: req.to.replace("+", ""), template_id: rendered.templateId, ...req.vars }),
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
      console.error(`[sms:msg91 → ${maskMobile(req.to)}] send failed`);
      return { messageId: row!.id, providerId: null, body: rendered.body };
    }
  }
}
