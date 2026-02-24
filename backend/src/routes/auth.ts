import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import {
  buildLoginAttemptKey,
  generateOpaqueToken,
  getPasswordResetTokenExpiresAt,
  getRefreshTokenExpiresAt,
  hashOpaqueToken,
  loginAttemptStore,
} from '../services/auth-security-service.js';
import { db } from '../services/db.js';
import { hashPassword, verifyPassword } from '../services/password-service.js';
import { emitSecurityEvent } from '../services/security-event-service.js';
import { signAccessToken } from '../services/token-service.js';
import { HttpError } from '../types/http-error.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupWithInviteSchema = z.object({
  inviteCode: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const ipAddress = getClientIp(req);
    const attemptKey = buildLoginAttemptKey(payload.email, ipAddress);

    const lockState = loginAttemptStore.isLocked(attemptKey);
    if (lockState.locked) {
      await emitSecurityEvent({
        eventType: 'AUTH_LOGIN_LOCKED',
        severity: 'WARN',
        ipAddress,
        userAgent: req.header('user-agent') ?? null,
        metadata: { email: payload.email.toLowerCase(), retryAfterSeconds: lockState.retryAfterSeconds },
      });
      throw new HttpError(429, `Too many failed login attempts. Retry in ${lockState.retryAfterSeconds} seconds.`);
    }

    const user = await db.findUserByEmail(payload.email);
    if (!user || !user.isActive) {
      loginAttemptStore.recordFailure(attemptKey);
      await emitSecurityEvent({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'WARN',
        ipAddress,
        userAgent: req.header('user-agent') ?? null,
        metadata: { email: payload.email.toLowerCase(), reason: 'INVALID_CREDENTIALS' },
      });
      throw new HttpError(401, 'Invalid credentials');
    }

    const matches = await verifyPassword(payload.password, user.passwordHash);
    if (!matches) {
      loginAttemptStore.recordFailure(attemptKey);
      await emitSecurityEvent({
        eventType: 'AUTH_LOGIN_FAILED',
        severity: 'WARN',
        userId: user.id,
        tenantId: user.tenantId,
        ipAddress,
        userAgent: req.header('user-agent') ?? null,
        metadata: { email: payload.email.toLowerCase(), reason: 'INVALID_CREDENTIALS' },
      });
      throw new HttpError(401, 'Invalid credentials');
    }

    loginAttemptStore.clear(attemptKey);

    const sessionPayload = await issueSessionTokens({
      userId: user.id,
      userAgent: req.header('user-agent') ?? null,
      ipAddress,
    });

    const authUser = {
      ...db.toAuthUser(user),
      sessionId: sessionPayload.sessionId,
    };

    const accessToken = signAccessToken(authUser);

    await emitSecurityEvent({
      eventType: 'AUTH_LOGIN_SUCCESS',
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress,
      userAgent: req.header('user-agent') ?? null,
      metadata: { sessionId: sessionPayload.sessionId },
    });

    res.json({
      accessToken,
      refreshToken: sessionPayload.refreshToken,
      user: authUser,
    });
  }),
);

authRouter.post(
  '/signup-invite',
  asyncHandler(async (req, res) => {
    const payload = signupWithInviteSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);

    const user = await db.signupWithInvite({
      code: payload.inviteCode,
      email: payload.email,
      passwordHash,
    });

    const sessionPayload = await issueSessionTokens({
      userId: user.id,
      userAgent: req.header('user-agent') ?? null,
      ipAddress: getClientIp(req),
    });

    const authUser = {
      ...db.toAuthUser(user),
      sessionId: sessionPayload.sessionId,
    };

    const accessToken = signAccessToken(authUser);

    await emitSecurityEvent({
      eventType: 'AUTH_SIGNUP_INVITE_SUCCESS',
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: getClientIp(req),
      userAgent: req.header('user-agent') ?? null,
      metadata: { role: user.role, sessionId: sessionPayload.sessionId },
    });

    res.status(201).json({
      accessToken,
      refreshToken: sessionPayload.refreshToken,
      user: authUser,
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    const providedTokenHash = hashOpaqueToken(payload.refreshToken);

    const existingSession = await db.findAuthSessionByRefreshTokenHash(providedTokenHash);
    if (!existingSession) {
      await emitSecurityEvent({
        eventType: 'AUTH_REFRESH_FAILED',
        severity: 'WARN',
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'SESSION_NOT_FOUND' },
      });
      throw new HttpError(401, 'Invalid refresh token');
    }

    const isExpired = new Date(existingSession.expiresAt).getTime() <= Date.now();
    if (existingSession.revokedAt || isExpired) {
      if (existingSession.revokedAt) {
        await db.revokeAllAuthSessionsForUser(existingSession.userId, 'Refresh token replay detected');
        await emitSecurityEvent({
          eventType: 'AUTH_REFRESH_REPLAY_DETECTED',
          severity: 'ERROR',
          userId: existingSession.userId,
          tenantId: null,
          ipAddress: getClientIp(req),
          userAgent: req.header('user-agent') ?? null,
          metadata: { sessionId: existingSession.id },
        });
      } else {
        await emitSecurityEvent({
          eventType: 'AUTH_REFRESH_FAILED',
          severity: 'WARN',
          userId: existingSession.userId,
          ipAddress: getClientIp(req),
          userAgent: req.header('user-agent') ?? null,
          metadata: { reason: 'SESSION_EXPIRED', sessionId: existingSession.id },
        });
      }
      throw new HttpError(401, 'Refresh token is not active');
    }

    const user = await db.findUserById(existingSession.userId);
    if (!user || !user.isActive) {
      await emitSecurityEvent({
        eventType: 'AUTH_REFRESH_FAILED',
        severity: 'WARN',
        userId: existingSession.userId,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'USER_INACTIVE', sessionId: existingSession.id },
      });
      throw new HttpError(401, 'User is inactive');
    }

    const sessionPayload = await issueSessionTokens({
      userId: user.id,
      userAgent: req.header('user-agent') ?? existingSession.userAgent,
      ipAddress: getClientIp(req),
    });

    await db.revokeAuthSession({
      sessionId: existingSession.id,
      reason: 'Refresh token rotated',
      replacedBySessionId: sessionPayload.sessionId,
    });

    const authUser = {
      ...db.toAuthUser(user),
      sessionId: sessionPayload.sessionId,
    };

    const accessToken = signAccessToken(authUser);

    await emitSecurityEvent({
      eventType: 'AUTH_REFRESH_SUCCESS',
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: getClientIp(req),
      userAgent: req.header('user-agent') ?? null,
      metadata: {
        oldSessionId: existingSession.id,
        newSessionId: sessionPayload.sessionId,
      },
    });

    res.json({
      accessToken,
      refreshToken: sessionPayload.refreshToken,
      user: authUser,
    });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const payload = refreshSchema.parse(req.body);
    const refreshTokenHash = hashOpaqueToken(payload.refreshToken);
    const existingSession = await db.findAuthSessionByRefreshTokenHash(refreshTokenHash);

    if (existingSession) {
      await db.revokeAuthSession({
        sessionId: existingSession.id,
        reason: 'User logout',
      });

      const user = await db.findUserById(existingSession.userId);
      await emitSecurityEvent({
        eventType: 'AUTH_LOGOUT',
        userId: existingSession.userId,
        tenantId: user?.tenantId ?? null,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { sessionId: existingSession.id },
      });
    }

    res.status(204).send();
  }),
);

authRouter.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await db.revokeAllAuthSessionsForUser(req.user!.id, 'User requested logout-all');
    await emitSecurityEvent({
      eventType: 'AUTH_LOGOUT_ALL',
      userId: req.user!.id,
      tenantId: req.user!.tenantId ?? null,
      ipAddress: getClientIp(req),
      userAgent: req.header('user-agent') ?? null,
      metadata: { requestId: req.requestId ?? null },
    });
    res.status(204).send();
  }),
);

authRouter.post(
  '/password-reset/request',
  asyncHandler(async (req, res) => {
    const payload = passwordResetRequestSchema.parse(req.body);

    const user = await db.findUserByEmail(payload.email);
    if (!user || !user.isActive) {
      await emitSecurityEvent({
        eventType: 'PASSWORD_RESET_REQUESTED_UNKNOWN_ACCOUNT',
        severity: 'WARN',
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { email: payload.email.toLowerCase() },
      });
      res.status(200).json({ message: 'If the account exists, a reset link has been generated.' });
      return;
    }

    const resetToken = generateOpaqueToken();
    const resetTokenHash = hashOpaqueToken(resetToken);
    const expiresAt = getPasswordResetTokenExpiresAt();

    await db.createPasswordResetToken({
      userId: user.id,
      tokenHash: resetTokenHash,
      expiresAt,
    });

    await emitSecurityEvent({
      eventType: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: getClientIp(req),
      userAgent: req.header('user-agent') ?? null,
      metadata: { expiresAt },
    });

    res.status(200).json({
      message: 'If the account exists, a reset link has been generated.',
      ...(process.env.NODE_ENV === 'production' ? {} : { resetToken }),
    });
  }),
);

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const payload = passwordResetConfirmSchema.parse(req.body);
    const tokenHash = hashOpaqueToken(payload.token);

    const resetToken = await db.findPasswordResetTokenByHash(tokenHash);
    if (!resetToken) {
      await emitSecurityEvent({
        eventType: 'PASSWORD_RESET_CONFIRM_FAILED',
        severity: 'WARN',
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'TOKEN_NOT_FOUND' },
      });
      throw new HttpError(400, 'Invalid password reset token');
    }

    if (resetToken.usedAt) {
      await emitSecurityEvent({
        eventType: 'PASSWORD_RESET_CONFIRM_FAILED',
        severity: 'WARN',
        userId: resetToken.userId,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'TOKEN_USED', tokenId: resetToken.id },
      });
      throw new HttpError(400, 'Password reset token has already been used');
    }

    if (new Date(resetToken.expiresAt).getTime() <= Date.now()) {
      await emitSecurityEvent({
        eventType: 'PASSWORD_RESET_CONFIRM_FAILED',
        severity: 'WARN',
        userId: resetToken.userId,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'TOKEN_EXPIRED', tokenId: resetToken.id },
      });
      throw new HttpError(400, 'Password reset token has expired');
    }

    const user = await db.findUserById(resetToken.userId);
    if (!user || !user.isActive) {
      await emitSecurityEvent({
        eventType: 'PASSWORD_RESET_CONFIRM_FAILED',
        severity: 'WARN',
        userId: resetToken.userId,
        ipAddress: getClientIp(req),
        userAgent: req.header('user-agent') ?? null,
        metadata: { reason: 'USER_INACTIVE', tokenId: resetToken.id },
      });
      throw new HttpError(400, 'Password reset token is invalid');
    }

    const newPasswordHash = await hashPassword(payload.newPassword);

    await db.updateUserPasswordHash(user.id, newPasswordHash);
    await db.markPasswordResetTokenUsed(resetToken.id);
    await db.revokeAllAuthSessionsForUser(user.id, 'Password reset');

    await emitSecurityEvent({
      eventType: 'PASSWORD_RESET_CONFIRMED',
      userId: user.id,
      tenantId: user.tenantId,
      ipAddress: getClientIp(req),
      userAgent: req.header('user-agent') ?? null,
      metadata: { tokenId: resetToken.id },
    });

    res.status(200).json({ message: 'Password has been reset successfully.' });
  }),
);

async function issueSessionTokens(input: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ refreshToken: string; sessionId: string }> {
  const refreshToken = generateOpaqueToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = getRefreshTokenExpiresAt();

  const session = await db.createAuthSession({
    userId: input.userId,
    refreshTokenHash,
    expiresAt,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  return {
    refreshToken,
    sessionId: session.id,
  };
}

function getClientIp(req: { ip?: string; header(name: string): string | undefined }): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const [first] = forwarded.split(',');
    if (first?.trim()) {
      return first.trim();
    }
  }

  return req.ip ?? '127.0.0.1';
}

export { authRouter };
