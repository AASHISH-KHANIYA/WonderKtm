import type { Request } from 'express';
import { AuditLog } from '../models/index.js';

export async function audit(req: Request | undefined, action: string, entity?: string, entityId?: unknown, meta?: Record<string, unknown>) {
  try {
    await AuditLog.create({ actor: req?.user?._id, actorEmail: req?.user?.email, action, entity, entityId: entityId ? String(entityId) : undefined, meta, ip: req?.ip });
  } catch {
    /* audit failures must not break the request, but are visible in server logs */
    console.error('audit log write failed', action);
  }
}
