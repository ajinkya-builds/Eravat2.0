/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { describe, it, expect, beforeAll } from 'vitest';
import { encryptSession, decryptSession } from '../crypto';

// Polyfill window.crypto for Node environment testing if needed
beforeAll(() => {
  if (typeof window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
  if (!globalThis.window.crypto) {
    globalThis.window.crypto = require('crypto').webcrypto as any;
  }
});

describe('Crypto Utility Tests', () => {
  const mockSession = {
    access_token: 'fake-access-token-12345',
    refresh_token: 'fake-refresh-token-67890',
    user: {
      id: 'test-user-uuid',
      phone: '+919999999999'
    }
  };
  const correctPin = '1234';
  const wrongPin = '5678';

  it('should encrypt and decrypt a session successfully with the correct PIN', async () => {
    const encrypted = await encryptSession(mockSession, correctPin);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.salt).toBeDefined();

    const decrypted = await decryptSession(encrypted, correctPin);
    expect(decrypted).toEqual(mockSession);
  });

  it('should throw an error when attempting to decrypt with the wrong PIN', async () => {
    const encrypted = await encryptSession(mockSession, correctPin);
    await expect(decryptSession(encrypted, wrongPin)).rejects.toThrow('Authentication failed. Invalid PIN.');
  });
});
