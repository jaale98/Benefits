import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { attachRequestContext } from './middleware/request-context.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.js';
import { companyAdminRouter } from './routes/company-admin.js';
import { employeeRouter } from './routes/employee.js';
import { fullAdminRouter } from './routes/full-admin.js';
import { healthRouter } from './routes/health.js';

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(attachRequestContext);
app.use(express.json());

app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/full-admin', fullAdminRouter);
app.use('/tenants/:tenantId/company-admin', companyAdminRouter);
app.use('/tenants/:tenantId/employee', employeeRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
