import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { UserRole } from '../../db/schema.ts';

const getJwtSecret = (): string => {
  return (
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    crypto
      .createHash('sha256')
      .update(`${process.env.SQL_DB_NAME || 'nacenis'}-dev-jwt-key`)
      .digest('hex')
  );
};

const getEncryptionKey = (): Buffer => {
  const raw =
    process.env.FIELD_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'nacenis-construction-supply-field-key';
  return crypto.createHash('sha256').update(raw).digest();
};

export function encryptSensitiveField(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitiveField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, dataHex] = parts;
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export interface SessionJwtPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export function signSessionToken(payload: SessionJwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifySessionToken(token: string): SessionJwtPayload {
  return jwt.verify(token, getJwtSecret()) as SessionJwtPayload;
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
