import type { Server as SocketIOServer } from 'socket.io';
import { db } from '../../db/index.ts';
import { auditLogs, notifications } from '../../db/schema.ts';

let socketServer: SocketIOServer | null = null;

export function setSocketServer(io: SocketIOServer) {
  socketServer = io;
}

export function getSocketServer(): SocketIOServer | null {
  return socketServer;
}

export function emitRealtimeEvent(eventName: string, payload: unknown) {
  if (socketServer) {
    socketServer.emit(eventName, payload);
  }
}

export async function logAudit(params: {
  userId?: number | null;
  actorEmail?: string;
  action: string;
  entityType: string;
  entityId: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: params.userId ?? null,
      actorEmail: params.actorEmail || 'system',
      action: params.action,
      entityType: params.entityType,
      entityId: String(params.entityId),
      details: params.details || {},
      ipAddress: params.ipAddress || '',
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export async function createNotification(params: {
  userId?: number | null;
  targetRole?: string | null;
  type: string;
  title: string;
  message: string;
  linkView?: string;
}) {
  try {
    const [created] = await db
      .insert(notifications)
      .values({
        userId: params.userId ?? null,
        targetRole: params.targetRole ?? null,
        type: params.type,
        title: params.title,
        message: params.message,
        linkView: params.linkView || 'dashboard',
      })
      .returning();

    emitRealtimeEvent('notification:new', created);
    return created;
  } catch (err) {
    console.error('Failed to create notification:', err);
    return null;
  }
}
