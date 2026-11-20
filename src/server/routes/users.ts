import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  auditLogs,
  businessAccounts,
  loginActivities,
  USER_ROLES,
  users,
} from '../../db/schema.ts';
import {
  INITIAL_ADMIN_EMAIL,
  requireAuth,
  requireRoles,
  type AuthRequest,
} from '../middleware/auth.ts';
import { logAudit } from '../utils/audit.ts';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRoles('SUPER_ADMIN', 'SALES_MANAGER'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          emailVerified: users.emailVerified,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          companyName: businessAccounts.companyName,
          tinLastFour: businessAccounts.tinLastFour,
          creditLimitRwf: businessAccounts.creditLimitRwf,
          paymentTerms: businessAccounts.paymentTerms,
          b2bVerified: businessAccounts.verified,
        })
        .from(users)
        .leftJoin(businessAccounts, eq(businessAccounts.userId, users.id))
        .orderBy(desc(users.createdAt));

      res.json({ users: rows });
    } catch (error) {
      console.error('List users error:', error);
      res.status(500).json({ error: 'Failed to load users.' });
    }
  }
);

router.patch(
  '/:id/role',
  requireAuth,
  requireRoles('SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = z
        .object({ role: z.enum(USER_ROLES) })
        .safeParse(req.body);
      if (!parsed.success || Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid role or user ID.' });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      if (
        target.email.toLowerCase() === INITIAL_ADMIN_EMAIL &&
        parsed.data.role !== 'SUPER_ADMIN'
      ) {
        return res
          .status(400)
          .json({ error: 'Primary Super Administrator role cannot be revoked.' });
      }

      const [updated] = await db
        .update(users)
        .set({ role: parsed.data.role, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
        });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: 'USER_ROLE_UPDATED',
        entityType: 'user',
        entityId: id,
        details: { previousRole: target.role, newRole: parsed.data.role },
        ipAddress: req.ip,
      });

      res.json({ user: updated });
    } catch (error) {
      console.error('Role update error:', error);
      res.status(500).json({ error: 'Failed to update user role.' });
    }
  }
);

router.patch(
  '/:id/status',
  requireAuth,
  requireRoles('SUPER_ADMIN'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const parsed = z
        .object({ isActive: z.boolean() })
        .safeParse(req.body);
      if (!parsed.success || Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid status payload.' });
      }

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) {
        return res.status(404).json({ error: 'User not found.' });
      }

      if (
        target.email.toLowerCase() === INITIAL_ADMIN_EMAIL &&
        !parsed.data.isActive
      ) {
        return res
          .status(400)
          .json({ error: 'Cannot deactivate primary Super Administrator.' });
      }

      const [updated] = await db
        .update(users)
        .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
        });

      await logAudit({
        userId: req.authUser!.id,
        actorEmail: req.authUser!.email,
        action: parsed.data.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'user',
        entityId: id,
        ipAddress: req.ip,
      });

      res.json({ user: updated });
    } catch (error) {
      console.error('Status update error:', error);
      res.status(500).json({ error: 'Failed to update account status.' });
    }
  }
);

router.get(
  '/login-activities',
  requireAuth,
  requireRoles('SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: loginActivities.id,
          userId: loginActivities.userId,
          email: users.email,
          fullName: users.fullName,
          method: loginActivities.method,
          ipAddress: loginActivities.ipAddress,
          success: loginActivities.success,
          createdAt: loginActivities.createdAt,
        })
        .from(loginActivities)
        .innerJoin(users, eq(users.id, loginActivities.userId))
        .orderBy(desc(loginActivities.createdAt))
        .limit(100);

      res.json({ activities: rows });
    } catch (error) {
      console.error('Login activities error:', error);
      res.status(500).json({ error: 'Failed to load login activity.' });
    }
  }
);

router.get(
  '/audit-logs',
  requireAuth,
  requireRoles('SUPER_ADMIN'),
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(150);

      res.json({ logs: rows });
    } catch (error) {
      console.error('Audit logs error:', error);
      res.status(500).json({ error: 'Failed to load audit logs.' });
    }
  }
);

export default router;
