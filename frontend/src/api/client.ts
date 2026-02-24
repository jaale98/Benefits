import type { components } from './generated';

export interface ApiTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  getTokens: () => ApiTokens | null;
  setTokens: (tokens: ApiTokens | null) => void;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed with status ${status}`;

    super(message);
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getTokens: () => ApiTokens | null;
  private readonly setTokens: (tokens: ApiTokens | null) => void;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getTokens = options.getTokens;
    this.setTokens = options.setTokens;
  }

  async login(payload: components['schemas']['LoginRequest']): Promise<components['schemas']['LoginResponse']> {
    const response = await this.request<components['schemas']['LoginResponse']>('/auth/login', 'POST', payload, false);
    this.setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    return response;
  }

  async signupInvite(payload: components['schemas']['SignupInviteRequest']): Promise<components['schemas']['LoginResponse']> {
    const response = await this.request<components['schemas']['LoginResponse']>('/auth/signup-invite', 'POST', payload, false);
    this.setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    return response;
  }

  async refresh(): Promise<components['schemas']['LoginResponse']> {
    const tokens = this.getTokens();
    if (!tokens) {
      throw new ApiError(401, { error: 'No refresh token available' });
    }

    const response = await this.request<components['schemas']['LoginResponse']>(
      '/auth/refresh',
      'POST',
      { refreshToken: tokens.refreshToken },
      false,
    );
    this.setTokens({ accessToken: response.accessToken, refreshToken: response.refreshToken });
    return response;
  }

  async logout(): Promise<void> {
    const tokens = this.getTokens();
    if (!tokens) {
      return;
    }

    await this.request<void>('/auth/logout', 'POST', { refreshToken: tokens.refreshToken }, false, true);
    this.setTokens(null);
  }

  async logoutAll(): Promise<void> {
    await this.request<void>('/auth/logout-all', 'POST', {}, true, true);
    this.setTokens(null);
  }

  async requestPasswordReset(email: string): Promise<components['schemas']['MessageResponse']> {
    return this.request('/auth/password-reset/request', 'POST', { email }, false);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<components['schemas']['MessageResponse']> {
    return this.request('/auth/password-reset/confirm', 'POST', { token, newPassword }, false);
  }

  async listTenants(limit?: number, offset?: number): Promise<{
    tenants?: components['schemas']['Tenant'][];
    page?: components['schemas']['PageInfo'];
  }> {
    const queryParams = new URLSearchParams();
    if (typeof limit === 'number') {
      queryParams.set('limit', String(limit));
    }
    if (typeof offset === 'number') {
      queryParams.set('offset', String(offset));
    }
    const query = queryParams.toString();
    return this.request(`/full-admin/tenants${query ? `?${query}` : ''}`, 'GET', undefined, true);
  }

  async createTenant(payload: components['schemas']['CreateTenantRequest']): Promise<{ tenant?: components['schemas']['Tenant'] }> {
    return this.request('/full-admin/tenants', 'POST', payload, true);
  }

  async createCompanyAdminInvite(tenantId: string, payload: components['schemas']['CreateInviteCodeRequest']): Promise<{ inviteCode?: components['schemas']['InviteCode'] }> {
    return this.request(`/full-admin/tenants/${tenantId}/invite-codes/company-admin`, 'POST', payload, true);
  }

  async listFullAdminSecurityEvents(input?: {
    limit?: number;
    offset?: number;
    tenantId?: string;
    severity?: 'INFO' | 'WARN' | 'ERROR';
    eventType?: string;
    q?: string;
  }): Promise<{
    events?: components['schemas']['SecurityEvent'][];
    page?: components['schemas']['PageInfo'];
  }> {
    const queryParams = new URLSearchParams();
    if (typeof input?.limit === 'number') {
      queryParams.set('limit', String(input.limit));
    }
    if (typeof input?.offset === 'number') {
      queryParams.set('offset', String(input.offset));
    }
    if (input?.tenantId) {
      queryParams.set('tenantId', input.tenantId);
    }
    if (input?.severity) {
      queryParams.set('severity', input.severity);
    }
    if (input?.eventType) {
      queryParams.set('eventType', input.eventType);
    }
    if (input?.q) {
      queryParams.set('q', input.q);
    }
    const query = queryParams.toString();
    return this.request(`/full-admin/security-events${query ? `?${query}` : ''}`, 'GET', undefined, true);
  }

  async listTenantUsers(
    tenantId: string,
    role?: 'COMPANY_ADMIN' | 'EMPLOYEE',
    limit?: number,
    offset?: number,
  ): Promise<{
    users?: components['schemas']['User'][];
    page?: components['schemas']['PageInfo'];
  }> {
    const queryParams = new URLSearchParams();
    if (role) {
      queryParams.set('role', role);
    }
    if (typeof limit === 'number') {
      queryParams.set('limit', String(limit));
    }
    if (typeof offset === 'number') {
      queryParams.set('offset', String(offset));
    }
    const query = queryParams.toString();
    return this.request(`/tenants/${tenantId}/company-admin/users${query ? `?${query}` : ''}`, 'GET', undefined, true);
  }

  async listEmployeeProfilesAsCompanyAdmin(
    tenantId: string,
  ): Promise<{ profiles?: components['schemas']['EmployeeProfile'][] }> {
    return this.request(`/tenants/${tenantId}/company-admin/employee-profiles`, 'GET', undefined, true);
  }

  async createEmployeeInvite(tenantId: string, payload: components['schemas']['CreateInviteCodeRequest']): Promise<{ inviteCode?: components['schemas']['InviteCode'] }> {
    return this.request(`/tenants/${tenantId}/company-admin/invite-codes/employee`, 'POST', payload, true);
  }

  async listCompanyAdminSecurityEvents(
    tenantId: string,
    input?: {
      limit?: number;
      offset?: number;
      severity?: 'INFO' | 'WARN' | 'ERROR';
      eventType?: string;
      q?: string;
    },
  ): Promise<{
    events?: components['schemas']['SecurityEvent'][];
    page?: components['schemas']['PageInfo'];
  }> {
    const queryParams = new URLSearchParams();
    if (typeof input?.limit === 'number') {
      queryParams.set('limit', String(input.limit));
    }
    if (typeof input?.offset === 'number') {
      queryParams.set('offset', String(input.offset));
    }
    if (input?.severity) {
      queryParams.set('severity', input.severity);
    }
    if (input?.eventType) {
      queryParams.set('eventType', input.eventType);
    }
    if (input?.q) {
      queryParams.set('q', input.q);
    }
    const query = queryParams.toString();
    return this.request(`/tenants/${tenantId}/company-admin/security-events${query ? `?${query}` : ''}`, 'GET', undefined, true);
  }

  async upsertEmployeeProfileAsCompanyAdmin(
    tenantId: string,
    employeeUserId: string,
    payload: components['schemas']['EmployeeProfileInput'],
  ): Promise<{ profile?: components['schemas']['EmployeeProfile'] }> {
    return this.request(`/tenants/${tenantId}/company-admin/employees/${employeeUserId}/profile`, 'PUT', payload, true);
  }

  async listPlanYearsAsCompanyAdmin(tenantId: string): Promise<{ planYears?: components['schemas']['PlanYear'][] }> {
    return this.request(`/tenants/${tenantId}/company-admin/plan-years`, 'GET', undefined, true);
  }

  async createPlanYear(
    tenantId: string,
    payload: components['schemas']['CreatePlanYearRequest'],
  ): Promise<{ planYear?: components['schemas']['PlanYear'] }> {
    return this.request(`/tenants/${tenantId}/company-admin/plan-years`, 'POST', payload, true);
  }

  async listPlansAsCompanyAdmin(tenantId: string, planYearId?: string): Promise<{ plans?: components['schemas']['Plan'][] }> {
    const query = planYearId ? `?planYearId=${encodeURIComponent(planYearId)}` : '';
    return this.request(`/tenants/${tenantId}/company-admin/plans${query}`, 'GET', undefined, true);
  }

  async createPlan(
    tenantId: string,
    payload: components['schemas']['CreatePlanRequest'],
  ): Promise<{ plan?: components['schemas']['Plan'] }> {
    return this.request(`/tenants/${tenantId}/company-admin/plans`, 'POST', payload, true);
  }

  async setPlanPremiums(
    tenantId: string,
    planId: string,
    payload: components['schemas']['SetPlanPremiumsRequest'],
  ): Promise<{ premiums?: components['schemas']['PlanPremium'][] }> {
    return this.request(`/tenants/${tenantId}/company-admin/plans/${planId}/premiums`, 'PUT', payload, true);
  }

  async listPlanYearsAsEmployee(tenantId: string): Promise<{ planYears?: components['schemas']['PlanYear'][] }> {
    return this.request(`/tenants/${tenantId}/employee/plan-years`, 'GET', undefined, true);
  }

  async listPlansAsEmployee(tenantId: string, planYearId?: string): Promise<{ plans?: components['schemas']['Plan'][] }> {
    const query = planYearId ? `?planYearId=${encodeURIComponent(planYearId)}` : '';
    return this.request(`/tenants/${tenantId}/employee/plans${query}`, 'GET', undefined, true);
  }

  async upsertEmployeeProfile(
    tenantId: string,
    payload: components['schemas']['EmployeeProfileInput'],
  ): Promise<{ profile?: components['schemas']['EmployeeProfile'] }> {
    return this.request(`/tenants/${tenantId}/employee/profile`, 'PUT', payload, true);
  }

  async listDependents(tenantId: string): Promise<{ dependents?: components['schemas']['Dependent'][] }> {
    return this.request(`/tenants/${tenantId}/employee/dependents`, 'GET', undefined, true);
  }

  async listEnrollments(tenantId: string): Promise<{ enrollments?: components['schemas']['Enrollment'][] }> {
    return this.request(`/tenants/${tenantId}/employee/enrollments`, 'GET', undefined, true);
  }

  async addDependent(
    tenantId: string,
    payload: components['schemas']['CreateDependentRequest'],
  ): Promise<{ dependent?: components['schemas']['Dependent'] }> {
    return this.request(`/tenants/${tenantId}/employee/dependents`, 'POST', payload, true);
  }

  async createEnrollmentDraft(
    tenantId: string,
    payload: components['schemas']['CreateEnrollmentDraftRequest'],
  ): Promise<{ enrollment?: components['schemas']['Enrollment'] }> {
    return this.request(`/tenants/${tenantId}/employee/enrollments/draft`, 'POST', payload, true);
  }

  async submitEnrollment(
    tenantId: string,
    enrollmentId: string,
    payload: components['schemas']['SubmitEnrollmentRequest'],
  ): Promise<{ enrollment?: components['schemas']['Enrollment'] }> {
    return this.request(`/tenants/${tenantId}/employee/enrollments/${enrollmentId}/submit`, 'POST', payload, true);
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
    requiresAuth = true,
    expectNoContent = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      const tokens = this.getTokens();
      if (!tokens?.accessToken) {
        throw new ApiError(401, { error: 'Missing access token' });
      }
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
    });

    if (expectNoContent && response.status === 204) {
      return undefined as T;
    }

    const responseBody = (await response.json().catch(() => null)) as unknown;

    if (response.status === 401 && requiresAuth && path !== '/auth/refresh') {
      const refreshTokens = this.getTokens();
      if (refreshTokens?.refreshToken) {
        try {
          await this.refresh();
          return this.request<T>(path, method, body, requiresAuth, expectNoContent);
        } catch {
          this.setTokens(null);
          throw new ApiError(response.status, responseBody);
        }
      }
    }

    if (!response.ok) {
      throw new ApiError(response.status, responseBody);
    }

    return responseBody as T;
  }
}
