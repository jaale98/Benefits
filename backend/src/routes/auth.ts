import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { db } from '../services/in-memory-db.js';
import { hashPassword, verifyPassword } from '../services/password-service.js';
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

const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);

    const user = db.findUserByEmail(payload.email);
    if (!user || !user.isActive) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const matches = await verifyPassword(payload.password, user.passwordHash);
    if (!matches) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const authUser = db.toAuthUser(user);
    const accessToken = signAccessToken(authUser);

    res.json({
      accessToken,
      user: authUser,
    });
  }),
);

authRouter.post(
  '/signup-invite',
  asyncHandler(async (req, res) => {
    const payload = signupWithInviteSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);

    const user = db.signupWithInvite({
      code: payload.inviteCode,
      email: payload.email,
      passwordHash,
    });

    const authUser = db.toAuthUser(user);
    const accessToken = signAccessToken(authUser);

    res.status(201).json({
      accessToken,
      user: authUser,
    });
  }),
);

export { authRouter };
