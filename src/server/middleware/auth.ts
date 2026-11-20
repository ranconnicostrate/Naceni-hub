import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users, type UserRole } from '../../db/schema.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { verifySessionToken } from '../utils/crypto.ts';

export const INITIAL_ADMIN_EMAIL = (
  process.env.INITIAL_ADMIN_EMAIL || 'kinyarwaranconnicostrate@gmail.com'
).toLowerCase();

export interface AuthenticatedUser {
  id: number;
  uid: string | null;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

async function resolveUserFromRequest(
  req: Request
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7).trim();
    if (idToken) {
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = (decoded.email || '').toLowerCase();
      if (!email) return null;

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const isSuperAdminEmail = email === INITIAL_ADMIN_EMAIL;
      const targetRole: UserRole =
        existing[0]?.role && !isSuperAdminEmail
          ? (existing[0].role as UserRole)
          : isSuperAdminEmail
            ? 'SUPER_ADMIN'
            : 'REGULAR_CUSTOMER';

      const upserted = await db
        .insert(users)
        .values({
          uid: decoded.uid,
          email,
          fullName: decoded.name || email.split('@')[0],
          role: targetRole,
          emailVerified: Boolean(decoded.email_verified),
          lastLoginAt: new Date(),
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            uid: decoded.uid,
            emailVerified: Boolean(decoded.email_verified) || undefined,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
            ...(isSuperAdminEmail ? { role: 'SUPER_ADMIN' } : {}),
          },
        })
        .returning();

      const u = upserted[0];
      return {
        id: u.id,
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone || '',
        role: u.role as UserRole,
        isActive: u.isActive,
        emailVerified: u.emailVerified,
      };
    }
  }

  const cookieToken = req.cookies?.naceni_token as string | undefined;
  if (cookieToken) {
    const payload = verifySessionToken(cookieToken);
    const found = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (found[0]) {
      const u = found[0];
      return {
        id: u.id,
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone || '',
        role: u.role as UserRole,
        isActive: u.isActive,
        emailVerified: u.emailVerified,
      };
    }
  }

  return null;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!user.isActive) {
      return res
        .status(403)
        .json({ error: 'Account has been deactivated. Contact administrator.' });
    }
    req.authUser = user;
    next();
  } catch (err) {
    console.error('Auth verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired credentials.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (user && user.isActive) {
      req.authUser = user;
    }
  } catch {
    // Ignore optional auth failures
  }
  next();
};

export const requireRoles = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (
      req.authUser.role !== 'SUPER_ADMIN' &&
      !allowedRoles.includes(req.authUser.role)
    ) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};
