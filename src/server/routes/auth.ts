import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/index.ts';
import {
  addresses,
  businessAccounts,
  loginActivities,
  users,
  type UserRole,
} from '../../db/schema.ts';
import {
  INITIAL_ADMIN_EMAIL,
  requireAuth,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  encryptSensitiveField,
  hashResetToken,
  signSessionToken,
} from '../utils/crypto.ts';
import { logAudit } from '../utils/audit.ts';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2),
  phone: z.string().optional().default(''),
  accountType: z.enum(['REGULAR', 'B2B']).default('REGULAR'),
  companyName: z.string().optional(),
  tinNumber: z.string().optional(),
  industry: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function setAuthCookie(res: any, token: string) {
  res.cookie('naceni_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function getFullUserProfile(userId: number) {
  const [user] = await db
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
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [business] = await db
    .select({
      id: businessAccounts.id,
      companyName: businessAccounts.companyName,
      tinLastFour: businessAccounts.tinLastFour,
      industry: businessAccounts.industry,
      creditLimitRwf: businessAccounts.creditLimitRwf,
      paymentTerms: businessAccounts.paymentTerms,
      verified: businessAccounts.verified,
    })
    .from(businessAccounts)
    .where(eq(businessAccounts.userId, userId))
    .limit(1);

  const userAddresses = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId));

  return {
    ...user,
    businessAccount: business || null,
    addresses: userAddresses,
  };
}

router.post('/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists.' });
    }

    if (parsed.data.accountType === 'B2B' && !parsed.data.companyName?.trim()) {
      return res
        .status(400)
        .json({ error: 'Company name is required for B2B registration.' });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const assignedRole: UserRole =
      email === INITIAL_ADMIN_EMAIL
        ? 'SUPER_ADMIN'
        : parsed.data.accountType === 'B2B'
          ? 'B2B_CUSTOMER'
          : 'REGULAR_CUSTOMER';

    const created = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(users)
        .values({
          email,
          passwordHash,
          fullName: parsed.data.fullName.trim(),
          phone: parsed.data.phone || '',
          role: assignedRole,
          isActive: true,
          emailVerified: false,
          lastLoginAt: new Date(),
        })
        .returning();

      if (parsed.data.accountType === 'B2B' && parsed.data.companyName) {
        const rawTin = (parsed.data.tinNumber || '100000000').trim();
        await tx.insert(businessAccounts).values({
          userId: newUser.id,
          companyName: parsed.data.companyName.trim(),
          tinNumberEncrypted: encryptSensitiveField(rawTin),
          tinLastFour: rawTin.slice(-4),
          industry: parsed.data.industry || 'Construction & Contracting',
          creditLimitRwf: 5000000,
          paymentTerms: 'NET_15',
          verified: false,
        });
      }

      await tx.insert(loginActivities).values({
        userId: newUser.id,
        method: 'password_register',
        ipAddress: req.ip || '',
        userAgent: req.get('user-agent') || '',
        success: true,
      });

      return newUser;
    });

    const token = signSessionToken({
      userId: created.id,
      email: created.email,
      role: created.role as UserRole,
    });
    setAuthCookie(res, token);

    await logAudit({
      userId: created.id,
      actorEmail: created.email,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: created.id,
      details: { role: created.role },
      ipAddress: req.ip,
    });

    const profile = await getFullUserProfile(created.id);
    res.status(201).json({ user: profile });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!found || !found.passwordHash) {
      return res.status(401).json({
        error:
          'Invalid email or password. If this account uses Google Sign-In, please continue with Google.',
      });
    }

    if (!found.isActive) {
      return res
        .status(403)
        .json({ error: 'This account has been deactivated by an administrator.' });
    }

    const match = await bcrypt.compare(parsed.data.password, found.passwordHash);
    if (!match) {
      await db.insert(loginActivities).values({
        userId: found.id,
        method: 'password',
        ipAddress: req.ip || '',
        userAgent: req.get('user-agent') || '',
        success: false,
      });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, found.id));

    await db.insert(loginActivities).values({
      userId: found.id,
      method: 'password',
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || '',
      success: true,
    });

    const token = signSessionToken({
      userId: found.id,
      email: found.email,
      role: found.role as UserRole,
    });
    setAuthCookie(res, token);

    const profile = await getFullUserProfile(found.id);
    res.json({ user: profile });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

router.post('/google-sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.authUser!;
    await db.insert(loginActivities).values({
      userId: authUser.id,
      method: 'google_oauth',
      ipAddress: req.ip || '',
      userAgent: req.get('user-agent') || '',
      success: true,
    });

    const token = signSessionToken({
      userId: authUser.id,
      email: authUser.email,
      role: authUser.role,
    });
    setAuthCookie(res, token);

    const profile = await getFullUserProfile(authUser.id);
    res.json({ user: profile });
  } catch (error) {
    console.error('Google sync error:', error);
    res.status(500).json({ error: 'Failed to synchronize account session.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('naceni_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = await getFullUserProfile(req.authUser!.id);
    res.json({ user: profile });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

router.patch('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      fullName: z.string().min(2).optional(),
      phone: z.string().optional(),
      companyName: z.string().optional(),
      tinNumber: z.string().optional(),
      industry: z.string().optional(),
      newAddress: z
        .object({
          label: z.string().min(1),
          recipientName: z.string().min(2),
          phone: z.string().min(6),
          province: z.string().min(2),
          district: z.string().min(2),
          sector: z.string().optional().default(''),
          streetAddress: z.string().min(3),
        })
        .optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid profile update fields.' });
    }

    const userId = req.authUser!.id;
    if (parsed.data.fullName || parsed.data.phone !== undefined) {
      await db
        .update(users)
        .set({
          ...(parsed.data.fullName ? { fullName: parsed.data.fullName } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    if (parsed.data.companyName) {
      const existingBiz = await db
        .select()
        .from(businessAccounts)
        .where(eq(businessAccounts.userId, userId))
        .limit(1);

      if (existingBiz.length > 0) {
        await db
          .update(businessAccounts)
          .set({
            companyName: parsed.data.companyName,
            ...(parsed.data.industry ? { industry: parsed.data.industry } : {}),
            ...(parsed.data.tinNumber
              ? {
                  tinNumberEncrypted: encryptSensitiveField(parsed.data.tinNumber),
                  tinLastFour: parsed.data.tinNumber.slice(-4),
                }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(businessAccounts.userId, userId));
      } else {
        const rawTin = parsed.data.tinNumber || '100000000';
        await db.insert(businessAccounts).values({
          userId,
          companyName: parsed.data.companyName,
          tinNumberEncrypted: encryptSensitiveField(rawTin),
          tinLastFour: rawTin.slice(-4),
          industry: parsed.data.industry || 'Construction & Contracting',
        });
      }
    }

    if (parsed.data.newAddress) {
      await db.insert(addresses).values({
        userId,
        ...parsed.data.newAddress,
        isDefault: false,
      });
    }

    const profile = await getFullUserProfile(userId);
    res.json({ user: profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const [found] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (found) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db
        .update(users)
        .set({
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: expiresAt,
        })
        .where(eq(users.id, found.id));

      await logAudit({
        userId: found.id,
        actorEmail: found.email,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'user',
        entityId: found.id,
        ipAddress: req.ip,
      });
    }

    res.json({
      message:
        'If an account exists for that email, password reset instructions have been queued.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Unable to process password reset request.' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      token: z.string().min(10),
      newPassword: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reset payload.' });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const tokenHash = hashResetToken(parsed.data.token);
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (
      !found ||
      !found.resetTokenHash ||
      found.resetTokenHash !== tokenHash ||
      !found.resetTokenExpiresAt ||
      found.resetTokenExpiresAt < new Date()
    ) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, found.id));

    res.json({ message: 'Password updated successfully. You may now sign in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

export default router;
