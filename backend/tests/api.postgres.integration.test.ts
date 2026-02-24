import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/services/db.js';

describe('API integration (postgres provider)', () => {
  beforeAll(async () => {
    await db.init();
  });

  it('runs with migrated schema and records security events', async () => {
    const loginResponse = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });

    expect(loginResponse.status).toBe(200);
    expect(typeof loginResponse.body.accessToken).toBe('string');
    expect(typeof loginResponse.body.refreshToken).toBe('string');
    expect(typeof loginResponse.body.user.sessionId).toBe('string');

    const eventsResponse = await request(app)
      .get('/full-admin/security-events?limit=20')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken as string}`);

    expect(eventsResponse.status).toBe(200);
    const eventTypes = (eventsResponse.body.events as Array<{ eventType?: string }>).map((event) => event.eventType);
    expect(eventTypes).toContain('AUTH_LOGIN_SUCCESS');
  });

  it('rotates refresh tokens and rejects replayed refresh tokens', async () => {
    const loginResponse = await request(app).post('/auth/login').send({
      email: 'platform-admin@example.com',
      password: 'ChangeMe123!',
    });

    const originalRefreshToken = loginResponse.body.refreshToken as string;

    const refreshResponse = await request(app).post('/auth/refresh').send({ refreshToken: originalRefreshToken });
    expect(refreshResponse.status).toBe(200);

    const replayResponse = await request(app).post('/auth/refresh').send({ refreshToken: originalRefreshToken });
    expect(replayResponse.status).toBe(401);
  });
});
