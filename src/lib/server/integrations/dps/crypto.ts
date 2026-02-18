import 'server-only';

import crypto from 'node:crypto';

const ENCRYPTION_VERSION = 'v1';

function getRawKey(): Buffer {
  const value = process.env.DPS_TOKEN_ENCRYPTION_KEY;

  if (!value) {
    throw new Error('DPS_TOKEN_ENCRYPTION_KEY is missing');
  }

  try {
    const maybeBase64 = Buffer.from(value, 'base64');
    if (maybeBase64.length >= 32) {
      return maybeBase64.subarray(0, 32);
    }
  } catch {
    // Fallback to hashed raw secret below.
  }

  return crypto.createHash('sha256').update(value).digest();
}

function getKey(): Buffer {
  const key = getRawKey();
  if (key.length !== 32) {
    throw new Error('DPS_TOKEN_ENCRYPTION_KEY must resolve to 32 bytes');
  }
  return key;
}

export function encryptDpsToken(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptDpsToken(cipherText: string): string {
  const [version, ivB64, tagB64, dataB64] = cipherText.split(':');

  if (version !== ENCRYPTION_VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unsupported token cipher format');
  }

  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskToken(token: string): string {
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***${token.slice(-2)}`;
  }

  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}
