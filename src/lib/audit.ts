import { db } from "../db/client.js";
import * as t from "../db/schema.js";

/**
 * Append-only audit trail. The deck promises "an audit trail of quality readings,
 * receipts and payments; every grievance tied to a lot ID" — so every write that
 * touches money or a token lands here with who did it and the before/after.
 */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  await db.insert(t.auditLog).values({
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as object,
    after: (entry.after ?? null) as object,
  });
}
