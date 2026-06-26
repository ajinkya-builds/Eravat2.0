/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cryptographic utilities for local session encryption/decryption.
 * Uses native Web Crypto API (supported in modern browsers and Capacitor WebViews).
 * Algorithm: PBKDF2 with SHA-256 for key derivation, AES-GCM 256-bit for encryption.
 */

// Helper to convert Uint8Array to Hex string
function typedArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert Hex string to Uint8Array
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derives a cryptographic CryptoKey from a numeric PIN.
 * @param pin The 4-digit PIN string.
 * @param salt The salt value as a Uint8Array.
 */
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const rawKeyMaterial = encoder.encode(pin);

  // Import the raw PIN as key material
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    rawKeyMaterial as any,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the AES-GCM key using PBKDF2
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

/**
 * Encrypts arbitrary session data using a PIN.
 * @param data The session object to encrypt.
 * @param pin The 4-digit PIN string.
 */
export async function encryptSession(data: any, pin: string): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const rawData = encoder.encode(JSON.stringify(data));

  // Generate 12-byte IV for AES-GCM and 16-byte salt for PBKDF2
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));

  // Derive key from PIN and salt
  const key = await deriveKey(pin, salt);

  // Encrypt the raw data
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any
    },
    key,
    rawData as any
  );

  return {
    ciphertext: typedArrayToHex(new Uint8Array(ciphertextBuffer)),
    iv: typedArrayToHex(iv),
    salt: typedArrayToHex(salt)
  };
}

/**
 * Decrypts a session payload using a PIN.
 * @param payload The encrypted session payload.
 * @param pin The 4-digit PIN string.
 */
export async function decryptSession(payload: EncryptedPayload, pin: string): Promise<any> {
  const ciphertext = hexToUint8Array(payload.ciphertext);
  const iv = hexToUint8Array(payload.iv);
  const salt = hexToUint8Array(payload.salt);

  // Derive key from PIN and salt
  const key = await deriveKey(pin, salt);

  try {
    // Decrypt the ciphertext
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any
      },
      key,
      ciphertext as any
    );

    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decryptedBuffer);

    return JSON.parse(decryptedText);
  } catch {
    throw new Error('Authentication failed. Invalid PIN.');
  }
}
