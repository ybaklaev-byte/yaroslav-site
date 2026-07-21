import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  const candidate = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export function validEmail(s) {
  return typeof s === 'string' && s.includes('@') && s.length >= 5;
}

export function validPassword(s) {
  return typeof s === 'string' && s.length >= 6;
}
