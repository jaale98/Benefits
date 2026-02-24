import { createHash, randomBytes } from 'crypto';
import { env } from '../config/env.js';

interface LoginAttemptState {
  failures: number;
  lockUntil: number | null;
  lastFailureAt: number;
}

export class LoginAttemptStore {
  private readonly attempts = new Map<string, LoginAttemptState>();

  isLocked(key: string): { locked: boolean; retryAfterSeconds: number } {
    this.cleanupKey(key);

    const state = this.attempts.get(key);
    if (!state?.lockUntil) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    const now = Date.now();
    if (state.lockUntil <= now) {
      this.attempts.delete(key);
      return { locked: false, retryAfterSeconds: 0 };
    }

    return {
      locked: true,
      retryAfterSeconds: Math.ceil((state.lockUntil - now) / 1000),
    };
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const current = this.attempts.get(key) ?? {
      failures: 0,
      lockUntil: null,
      lastFailureAt: now,
    };

    current.failures += 1;
    current.lastFailureAt = now;

    if (current.failures >= env.LOGIN_MAX_ATTEMPTS) {
      current.lockUntil = now + env.LOGIN_LOCK_MINUTES * 60 * 1000;
      current.failures = 0;
    }

    this.attempts.set(key, current);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  private cleanupKey(key: string): void {
    const current = this.attempts.get(key);
    if (!current) {
      return;
    }

    const now = Date.now();
    const staleThresholdMs = 24 * 60 * 60 * 1000;

    if (current.lockUntil && current.lockUntil <= now) {
      this.attempts.delete(key);
      return;
    }

    if (!current.lockUntil && now - current.lastFailureAt > staleThresholdMs) {
      this.attempts.delete(key);
    }
  }
}

export const loginAttemptStore = new LoginAttemptStore();

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function getRefreshTokenExpiresAt(): string {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

export function getPasswordResetTokenExpiresAt(): string {
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  return expiresAt.toISOString();
}

export function buildLoginAttemptKey(email: string, ipAddress: string): string {
  return `${email.toLowerCase()}|${ipAddress}`;
}
