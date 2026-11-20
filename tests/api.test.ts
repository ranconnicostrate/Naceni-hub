import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.ts';
import {
  decryptSensitiveField,
  encryptSensitiveField,
  hashResetToken,
  signSessionToken,
  verifySessionToken,
} from '../src/server/utils/crypto.ts';

async function startTestServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('AES-256-GCM field encryption round-trip for sensitive TIN/account data', () => {
  const tin = '104928371';
  const encrypted = encryptSensitiveField(tin);
  assert.notEqual(encrypted, tin);
  assert.equal(encrypted.split(':').length, 3);
  assert.equal(decryptSensitiveField(encrypted), tin);
});

test('JWT session signing & verification + SHA-256 reset token hashing', () => {
  const token = signSessionToken({
    userId: 42,
    email: 'buyer@nacenisbusiness.rw',
    role: 'B2B_CUSTOMER',
  });
  const decoded = verifySessionToken(token);
  assert.equal(decoded.userId, 42);
  assert.equal(decoded.role, 'B2B_CUSTOMER');

  const h1 = hashResetToken('sample-reset-secret');
  const h2 = hashResetToken('sample-reset-secret');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
});

test('Health endpoint, OpenAPI docs, and RBAC enforcement on protected routes', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as { status: string };
    assert.equal(health.status, 'ok');

    const docsRes = await fetch(`${baseUrl}/api/docs/openapi.json`);
    assert.equal(docsRes.status, 200);
    const spec = (await docsRes.json()) as { openapi: string };
    assert.equal(spec.openapi, '3.0.3');

    const protectedAnalytics = await fetch(`${baseUrl}/api/analytics/dashboard`);
    assert.equal(protectedAnalytics.status, 401);

    const protectedInventory = await fetch(`${baseUrl}/api/inventory`);
    assert.equal(protectedInventory.status, 401);

    // Verify customer token cannot access admin analytics (403 Forbidden)
    const customerToken = signSessionToken({
      userId: 999,
      email: 'customer@example.com',
      role: 'REGULAR_CUSTOMER',
    });
    const forbiddenAnalytics = await fetch(`${baseUrl}/api/analytics/dashboard`, {
      headers: { Cookie: `naceni_token=${customerToken}` },
    });
    assert.ok(
      forbiddenAnalytics.status === 401 || forbiddenAnalytics.status === 403,
      `Expected 401 or 403, got ${forbiddenAnalytics.status}`
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
