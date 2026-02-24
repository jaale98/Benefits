import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthUser } from '../types/auth.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
  tenantId: string | null;
}

export function signAccessToken(user: AuthUser): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

  const signOptions: jwt.SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    subject: user.id,
  };

  return jwt.sign(payload, env.JWT_SECRET, signOptions);
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

  return {
    id: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    tenantId: decoded.tenantId,
  };
}
