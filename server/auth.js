import crypto from 'crypto';
import {
  createSession,
  createUser,
  deleteSessionByTokenHash,
  getSessionByTokenHash,
  getUserWithPasswordByEmail,
} from './workflowStore.js';

export const SESSION_COOKIE_NAME = 'aiyou_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || '').split(':');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

export function parseCookies(headerValue = '') {
  return String(headerValue)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const [rawKey, ...rest] = entry.split('=');
      if (!rawKey) return accumulator;
      accumulator[rawKey] = decodeURIComponent(rest.join('=') || '');
      return accumulator;
    }, {});
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

export async function registerUser({ email, password, name }) {
  const existing = await getUserWithPasswordByEmail(email);
  if (existing) {
    throw new Error('该邮箱已被注册。');
  }

  const passwordHash = hashPassword(password);
  return createUser({
    email,
    passwordHash,
    name: name || email.split('@')[0],
  });
}

export async function loginUser({ email, password }) {
  const userWithPassword = await getUserWithPasswordByEmail(email);
  if (!userWithPassword || !verifyPassword(password, userWithPassword.password_hash)) {
    throw new Error('邮箱或密码错误。');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await createSession({
    userId: userWithPassword.id,
    tokenHash,
    expiresAt,
  });

  return {
    user: {
      id: userWithPassword.id,
      email: userWithPassword.email,
      name: userWithPassword.name,
      createdAt: userWithPassword.created_at,
      updatedAt: userWithPassword.updated_at,
    },
    token: rawToken,
    expiresAt,
  };
}

export async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return null;
  return getSessionByTokenHash(sha256(rawToken));
}

export async function logoutUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return;
  await deleteSessionByTokenHash(sha256(rawToken));
}

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires: expiresAt,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
}
