import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiClient, ApiError, type ApiTokens } from './api/client';
import type { components } from './api/generated';

type Role = 'FULL_ADMIN' | 'COMPANY_ADMIN' | 'EMPLOYEE';
type SessionUser = components['schemas']['AuthUser'];
type Tenant = components['schemas']['Tenant'];
type User = components['schemas']['User'];
type EmployeeProfile = components['schemas']['EmployeeProfile'];
type PlanYear = components['schemas']['PlanYear'];
type Plan = components['schemas']['Plan'];
type Dependent = components['schemas']['Dependent'];
type Enrollment = components['schemas']['Enrollment'];
type SecurityEvent = components['schemas']['SecurityEvent'];
type PageInfo = components['schemas']['PageInfo'];

const DEFAULT_LOGIN_EMAIL = 'platform-admin@example.com';
const DEFAULT_LOGIN_PASSWORD = 'ChangeMe123!';
const PAGE_SIZE = 25;

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000');

  const [tokens, setTokens] = useState<ApiTokens | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [loginEmail, setLoginEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [loginPassword, setLoginPassword] = useState(DEFAULT_LOGIN_PASSWORD);
  const [signupInviteCode, setSignupInviteCode] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [latestCompanyAdminInviteCode, setLatestCompanyAdminInviteCode] = useState('');
  const [latestEmployeeInviteCode, setLatestEmployeeInviteCode] = useState('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantUsers, setTenantUsers] = useState<User[]>([]);
  const [employeeProfiles, setEmployeeProfiles] = useState<EmployeeProfile[]>([]);
  const [planYears, setPlanYears] = useState<PlanYear[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [fullAdminSecurityEvents, setFullAdminSecurityEvents] = useState<SecurityEvent[]>([]);
  const [companyAdminSecurityEvents, setCompanyAdminSecurityEvents] = useState<SecurityEvent[]>([]);
  const [tenantPage, setTenantPage] = useState<PageInfo | null>(null);
  const [tenantUsersPage, setTenantUsersPage] = useState<PageInfo | null>(null);
  const [fullAdminSecurityPage, setFullAdminSecurityPage] = useState<PageInfo | null>(null);
  const [companyAdminSecurityPage, setCompanyAdminSecurityPage] = useState<PageInfo | null>(null);
  const [tenantOffset, setTenantOffset] = useState(0);
  const [tenantUsersOffset, setTenantUsersOffset] = useState(0);
  const [fullAdminSecurityOffset, setFullAdminSecurityOffset] = useState(0);
  const [companyAdminSecurityOffset, setCompanyAdminSecurityOffset] = useState(0);
  const [securitySeverityFilter, setSecuritySeverityFilter] = useState<'INFO' | 'WARN' | 'ERROR' | ''>('');
  const [securityEventTypeFilter, setSecurityEventTypeFilter] = useState('');
  const [securityQueryFilter, setSecurityQueryFilter] = useState('');

  const [tenantName, setTenantName] = useState('');
  const [tenantCompanyId, setTenantCompanyId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const [employeeInviteMaxUses, setEmployeeInviteMaxUses] = useState('1');
  const [selectedEmployeeUserId, setSelectedEmployeeUserId] = useState('');

  const [employeeId, setEmployeeId] = useState('EMP-001');
  const [firstName, setFirstName] = useState('Taylor');
  const [lastName, setLastName] = useState('Employee');
  const [dob, setDob] = useState('1990-02-01');
  const [hireDate, setHireDate] = useState('2024-01-15');
  const [salaryAmount, setSalaryAmount] = useState('75000');
  const [benefitClass, setBenefitClass] = useState<'FULL_TIME_ELIGIBLE' | 'INELIGIBLE'>('FULL_TIME_ELIGIBLE');
  const [employmentStatus, setEmploymentStatus] = useState<'ACTIVE' | 'TERMED'>('ACTIVE');

  const [planYearName, setPlanYearName] = useState('2026 Plan Year');
  const [planYearStart, setPlanYearStart] = useState('2026-01-01');
  const [planYearEnd, setPlanYearEnd] = useState('2026-12-31');
  const [selectedPlanYearId, setSelectedPlanYearId] = useState('');

  const [planType, setPlanType] = useState<'MEDICAL' | 'DENTAL' | 'VISION'>('MEDICAL');
  const [planCarrier, setPlanCarrier] = useState('Aetna');
  const [planName, setPlanName] = useState('Aetna Gold PPO');
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const [employeeOnlyEmployeeCost, setEmployeeOnlyEmployeeCost] = useState('120');
  const [employeeOnlyEmployerCost, setEmployeeOnlyEmployerCost] = useState('480');
  const [employeeSpouseEmployeeCost, setEmployeeSpouseEmployeeCost] = useState('240');
  const [employeeSpouseEmployerCost, setEmployeeSpouseEmployerCost] = useState('760');
  const [employeeChildrenEmployeeCost, setEmployeeChildrenEmployeeCost] = useState('260');
  const [employeeChildrenEmployerCost, setEmployeeChildrenEmployerCost] = useState('840');
  const [familyEmployeeCost, setFamilyEmployeeCost] = useState('420');
  const [familyEmployerCost, setFamilyEmployerCost] = useState('980');

  const [dependentRelationship, setDependentRelationship] = useState<'SPOUSE' | 'CHILD'>('CHILD');
  const [dependentFirstName, setDependentFirstName] = useState('Jordan');
  const [dependentLastName, setDependentLastName] = useState('Dependent');
  const [dependentDob, setDependentDob] = useState('2015-05-01');

  const [draftPlanYearId, setDraftPlanYearId] = useState('');
  const [draftPlanId, setDraftPlanId] = useState('');
  const [draftCoverageTier, setDraftCoverageTier] = useState<'EMPLOYEE_ONLY' | 'EMPLOYEE_SPOUSE' | 'EMPLOYEE_CHILDREN' | 'FAMILY'>('EMPLOYEE_ONLY');
  const [selectedDependentIds, setSelectedDependentIds] = useState<string[]>([]);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState('');

  const tenantId = user?.tenantId ?? null;

  const api = useMemo(
    () =>
      new ApiClient({
        baseUrl: apiBaseUrl,
        getTokens: () => tokens,
        setTokens,
      }),
    [apiBaseUrl, tokens],
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    void refreshReferenceData();
  }, [
    user,
    tenantOffset,
    tenantUsersOffset,
    fullAdminSecurityOffset,
    companyAdminSecurityOffset,
    securitySeverityFilter,
    securityEventTypeFilter,
    securityQueryFilter,
  ]);

  useEffect(() => {
    if (!selectedPlanYearId && planYears.length > 0) {
      setSelectedPlanYearId(planYears[0]?.id ?? '');
    }
  }, [planYears, selectedPlanYearId]);

  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(plans[0]?.id ?? '');
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (!draftPlanYearId && planYears.length > 0) {
      setDraftPlanYearId(planYears[0]?.id ?? '');
    }
  }, [planYears, draftPlanYearId]);

  useEffect(() => {
    const filteredPlans = plans.filter((plan) => plan.planYearId === draftPlanYearId);
    if (!draftPlanId && filteredPlans.length > 0) {
      setDraftPlanId(filteredPlans[0]?.id ?? '');
    }
  }, [draftPlanYearId, plans, draftPlanId]);

  async function runAction<T>(label: string, action: () => Promise<T>, onSuccess?: (result: T) => void): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const result = await action();
      onSuccess?.(result);
      setMessage(`${label} succeeded.`);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(`${label} failed (${caught.status}): ${stringifyError(caught.body)}`);
      } else if (caught instanceof Error) {
        setError(`${label} failed: ${caught.message}`);
      } else {
        setError(`${label} failed.`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshReferenceData(): Promise<void> {
    if (!user) {
      return;
    }

    if (user.role === 'FULL_ADMIN') {
      const [tenantResponse, securityEventResponse] = await Promise.all([
        api.listTenants(PAGE_SIZE, tenantOffset),
        api.listFullAdminSecurityEvents({
          limit: PAGE_SIZE,
          offset: fullAdminSecurityOffset,
          severity: securitySeverityFilter || undefined,
          eventType: securityEventTypeFilter || undefined,
          q: securityQueryFilter || undefined,
        }),
      ]);
      const nextTenants = tenantResponse.tenants ?? [];
      setTenants(nextTenants);
      setTenantPage(tenantResponse.page ?? null);
      setFullAdminSecurityEvents(securityEventResponse.events ?? []);
      setFullAdminSecurityPage(securityEventResponse.page ?? null);
      setCompanyAdminSecurityEvents([]);
      setCompanyAdminSecurityPage(null);
      setTenantUsers([]);
      setTenantUsersPage(null);
      setEmployeeProfiles([]);
      if (!selectedTenantId && nextTenants.length > 0) {
        setSelectedTenantId(nextTenants[0].id ?? '');
      }
      return;
    }

    if (!tenantId) {
      return;
    }

    if (user.role === 'COMPANY_ADMIN') {
      const [usersResponse, profilesResponse, planYearsResponse, plansResponse, securityEventsResponse] = await Promise.all([
        api.listTenantUsers(tenantId, 'EMPLOYEE', PAGE_SIZE, tenantUsersOffset),
        api.listEmployeeProfilesAsCompanyAdmin(tenantId),
        api.listPlanYearsAsCompanyAdmin(tenantId),
        api.listPlansAsCompanyAdmin(tenantId),
        api.listCompanyAdminSecurityEvents(tenantId, {
          limit: PAGE_SIZE,
          offset: companyAdminSecurityOffset,
          severity: securitySeverityFilter || undefined,
          eventType: securityEventTypeFilter || undefined,
          q: securityQueryFilter || undefined,
        }),
      ]);

      setTenantUsers(usersResponse.users ?? []);
      setTenantUsersPage(usersResponse.page ?? null);
      setEmployeeProfiles(profilesResponse.profiles ?? []);
      setPlanYears(planYearsResponse.planYears ?? []);
      setPlans(plansResponse.plans ?? []);
      setCompanyAdminSecurityEvents(securityEventsResponse.events ?? []);
      setCompanyAdminSecurityPage(securityEventsResponse.page ?? null);
      setFullAdminSecurityEvents([]);
      setFullAdminSecurityPage(null);
      setTenantPage(null);

      if (!selectedEmployeeUserId && (usersResponse.users ?? []).length > 0) {
        setSelectedEmployeeUserId(usersResponse.users?.[0]?.id ?? '');
      }
      return;
    }

    const [planYearsResponse, plansResponse, dependentsResponse, enrollmentsResponse] = await Promise.all([
      api.listPlanYearsAsEmployee(tenantId),
      api.listPlansAsEmployee(tenantId),
      api.listDependents(tenantId),
      api.listEnrollments(tenantId),
    ]);

    setPlanYears(planYearsResponse.planYears ?? []);
    setPlans(plansResponse.plans ?? []);
    setDependents(dependentsResponse.dependents ?? []);
    setEnrollments(enrollmentsResponse.enrollments ?? []);
    setTenantPage(null);
    setTenantUsersPage(null);
    setFullAdminSecurityPage(null);
    setCompanyAdminSecurityPage(null);
    setEmployeeProfiles([]);
    setFullAdminSecurityEvents([]);
    setCompanyAdminSecurityEvents([]);

    if (!selectedEnrollmentId && (enrollmentsResponse.enrollments ?? []).length > 0) {
      setSelectedEnrollmentId(enrollmentsResponse.enrollments?.[0]?.id ?? '');
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runAction('Login', () => api.login({ email: loginEmail, password: loginPassword }), (response) => {
      setUser(response.user ?? null);
      setResetEmail(loginEmail);
      setResetToken('');
      setResetNewPassword('');
      setTenantOffset(0);
      setTenantUsersOffset(0);
      setFullAdminSecurityOffset(0);
      setCompanyAdminSecurityOffset(0);
    });
  }

  async function handleSignupInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runAction(
      'Signup with invite',
      () =>
        api.signupInvite({
          inviteCode: signupInviteCode,
          email: signupEmail,
          password: signupPassword,
        }),
      (response) => {
        setUser(response.user ?? null);
        setResetEmail(signupEmail);
        setSignupInviteCode('');
        setSignupEmail('');
        setSignupPassword('');
        setTenantOffset(0);
        setTenantUsersOffset(0);
        setFullAdminSecurityOffset(0);
        setCompanyAdminSecurityOffset(0);
      },
    );
  }

  async function handleLogout(): Promise<void> {
    await runAction('Logout', () => api.logout(), () => {
      setUser(null);
      setTokens(null);
      setTenants([]);
      setTenantUsers([]);
      setEmployeeProfiles([]);
      setPlanYears([]);
      setPlans([]);
      setDependents([]);
      setEnrollments([]);
      setFullAdminSecurityEvents([]);
      setCompanyAdminSecurityEvents([]);
      setTenantPage(null);
      setTenantUsersPage(null);
      setFullAdminSecurityPage(null);
      setCompanyAdminSecurityPage(null);
      setLatestCompanyAdminInviteCode('');
      setLatestEmployeeInviteCode('');
      setTenantOffset(0);
      setTenantUsersOffset(0);
      setFullAdminSecurityOffset(0);
      setCompanyAdminSecurityOffset(0);
      setSecuritySeverityFilter('');
      setSecurityEventTypeFilter('');
      setSecurityQueryFilter('');
    });
  }

  async function handleCreateTenant(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await runAction(
      'Create tenant',
      () =>
        api.createTenant({
          name: tenantName,
          companyId: tenantCompanyId || undefined,
        }),
      async () => {
        setTenantName('');
        setTenantCompanyId('');
        await refreshReferenceData();
      },
    );
  }

  async function handleCreateCompanyAdminInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTenantId) {
      setError('Select a tenant first.');
      return;
    }

    await runAction(
      'Create company admin invite',
      () => api.createCompanyAdminInvite(selectedTenantId, { maxUses: 1 }),
      (response) => {
        setLatestCompanyAdminInviteCode(response.inviteCode?.code ?? '');
      },
    );
  }

  async function handleCreateEmployeeInvite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    await runAction(
      'Create employee invite',
      () =>
        api.createEmployeeInvite(tenantId, {
          maxUses: Number(employeeInviteMaxUses),
        }),
      (response) => {
        setLatestEmployeeInviteCode(response.inviteCode?.code ?? '');
      },
    );
  }

  async function handleSaveEmployeeProfileAsCompanyAdmin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !selectedEmployeeUserId) {
      setError('Select an employee user first.');
      return;
    }

    await runAction('Save employee profile', () =>
      api.upsertEmployeeProfileAsCompanyAdmin(tenantId, selectedEmployeeUserId, buildEmployeeProfilePayload()),
    );
  }

  async function handleCreatePlanYear(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    await runAction(
      'Create plan year',
      () =>
        api.createPlanYear(tenantId, {
          name: planYearName,
          startDate: planYearStart,
          endDate: planYearEnd,
        }),
      async () => {
        await refreshReferenceData();
      },
    );
  }

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !selectedPlanYearId) {
      setError('Select a plan year first.');
      return;
    }

    await runAction(
      'Create plan',
      () =>
        api.createPlan(tenantId, {
          planYearId: selectedPlanYearId,
          type: planType,
          carrier: planCarrier,
          planName,
        }),
      async () => {
        await refreshReferenceData();
      },
    );
  }

  async function handleSetPremiums(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !selectedPlanId) {
      setError('Select a plan first.');
      return;
    }

    await runAction('Set plan premiums', () =>
      api.setPlanPremiums(tenantId, selectedPlanId, {
        tiers: [
          {
            coverageTier: 'EMPLOYEE_ONLY',
            employeeMonthlyCost: Number(employeeOnlyEmployeeCost),
            employerMonthlyCost: Number(employeeOnlyEmployerCost),
          },
          {
            coverageTier: 'EMPLOYEE_SPOUSE',
            employeeMonthlyCost: Number(employeeSpouseEmployeeCost),
            employerMonthlyCost: Number(employeeSpouseEmployerCost),
          },
          {
            coverageTier: 'EMPLOYEE_CHILDREN',
            employeeMonthlyCost: Number(employeeChildrenEmployeeCost),
            employerMonthlyCost: Number(employeeChildrenEmployerCost),
          },
          {
            coverageTier: 'FAMILY',
            employeeMonthlyCost: Number(familyEmployeeCost),
            employerMonthlyCost: Number(familyEmployerCost),
          },
        ],
      }),
    );
  }

  async function handleSaveEmployeeProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    await runAction('Save profile', () => api.upsertEmployeeProfile(tenantId, buildEmployeeProfilePayload()));
  }

  async function handleAddDependent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId) {
      return;
    }

    await runAction(
      'Add dependent',
      () =>
        api.addDependent(tenantId, {
          relationship: dependentRelationship,
          firstName: dependentFirstName,
          lastName: dependentLastName,
          dob: dependentDob,
        }),
      async () => {
        await refreshReferenceData();
      },
    );
  }

  async function handleCreateDraft(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !draftPlanYearId || !draftPlanId) {
      setError('Select plan year and plan first.');
      return;
    }

    const selectedPlan = plans.find((plan) => plan.id === draftPlanId);
    if (!selectedPlan?.type) {
      setError('Selected plan is invalid.');
      return;
    }

    await runAction(
      'Create enrollment draft',
      () =>
        api.createEnrollmentDraft(tenantId, {
          planYearId: draftPlanYearId,
          elections: [
            {
              planType: selectedPlan.type,
              planId: draftPlanId,
              coverageTier: draftCoverageTier,
            },
          ],
          dependentIds: selectedDependentIds,
        }),
      async () => {
        await refreshReferenceData();
      },
    );
  }

  async function handleSubmitEnrollment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!tenantId || !selectedEnrollmentId) {
      setError('Select an enrollment to submit.');
      return;
    }

    await runAction(
      'Submit enrollment',
      () => api.submitEnrollment(tenantId, selectedEnrollmentId, {}),
      async () => {
        await refreshReferenceData();
      },
    );
  }

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runAction('Request password reset', () => api.requestPasswordReset(resetEmail), (response) => {
      if (response.resetToken) {
        setResetToken(response.resetToken);
      }
    });
  }

  async function handlePasswordResetConfirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await runAction('Confirm password reset', () => api.confirmPasswordReset(resetToken, resetNewPassword));
  }

  function exportSecurityEventsCsv(events: SecurityEvent[]) {
    if (events.length === 0) {
      setError('No security events to export.');
      return;
    }

    const header = ['createdAt', 'severity', 'eventType', 'userId', 'tenantId', 'ipAddress', 'userAgent', 'metadata'];
    const rows = events.map((event) => [
      event.createdAt,
      event.severity,
      event.eventType,
      event.userId ?? '',
      event.tenantId ?? '',
      event.ipAddress ?? '',
      event.userAgent ?? '',
      JSON.stringify(event.metadata ?? {}),
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `security-events-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function buildEmployeeProfilePayload(): components['schemas']['EmployeeProfileInput'] {
    return {
      employeeId,
      firstName,
      lastName,
      dob,
      hireDate,
      salaryAmount: Number(salaryAmount),
      benefitClass,
      employmentStatus,
    };
  }

  function renderRolePanels() {
    if (!user) {
      return null;
    }

    if (user.role === 'FULL_ADMIN') {
      return (
        <>
          <section className="panel">
            <h2>Create Tenant</h2>
            <form onSubmit={handleCreateTenant}>
              <label>Tenant Name</label>
              <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} required />
              <label>Company ID (optional)</label>
              <input value={tenantCompanyId} onChange={(event) => setTenantCompanyId(event.target.value)} />
              <button disabled={loading}>Create Tenant</button>
            </form>
          </section>

          <section className="panel">
            <h2>Create Company Admin Invite</h2>
            <form onSubmit={handleCreateCompanyAdminInvite}>
              <label>Tenant</label>
              <select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.companyId})
                  </option>
                ))}
              </select>
              <button disabled={loading || !selectedTenantId}>Create Invite</button>
            </form>
            {latestCompanyAdminInviteCode && <p>Latest code: {latestCompanyAdminInviteCode}</p>}
          </section>

          <section className="panel">
            <h2>Tenants</h2>
            {tenants.length === 0 ? (
              <p>No tenants in this page.</p>
            ) : (
              <ul className="compact-list">
                {tenants.map((tenant) => (
                  <li key={tenant.id}>
                    {tenant.name} ({tenant.companyId})
                  </li>
                ))}
              </ul>
            )}
            {renderPageControls(tenantPage, () => setTenantOffset(Math.max(tenantOffset - PAGE_SIZE, 0)), () => setTenantOffset(tenantOffset + PAGE_SIZE))}
          </section>

          <section className="panel">
            <h2>Recent Security Events</h2>
            {renderSecurityFilters()}
            <div className="nav-list">
              <button type="button" onClick={() => exportSecurityEventsCsv(fullAdminSecurityEvents)}>
                Export CSV
              </button>
            </div>
            {renderSecurityEventList(fullAdminSecurityEvents)}
            {renderPageControls(
              fullAdminSecurityPage,
              () => setFullAdminSecurityOffset(Math.max(fullAdminSecurityOffset - PAGE_SIZE, 0)),
              () => setFullAdminSecurityOffset(fullAdminSecurityOffset + PAGE_SIZE),
            )}
          </section>
        </>
      );
    }

    if (user.role === 'COMPANY_ADMIN') {
      return (
        <>
          <section className="panel">
            <h2>Create Employee Invite</h2>
            <form onSubmit={handleCreateEmployeeInvite}>
              <label>Max Uses</label>
              <input value={employeeInviteMaxUses} onChange={(event) => setEmployeeInviteMaxUses(event.target.value)} required />
              <button disabled={loading}>Create Invite</button>
            </form>
            {latestEmployeeInviteCode && <p>Latest code: {latestEmployeeInviteCode}</p>}
          </section>

          <section className="panel">
            <h2>Set Employee Profile</h2>
            <form onSubmit={handleSaveEmployeeProfileAsCompanyAdmin}>
              <label>Employee User</label>
              <select value={selectedEmployeeUserId} onChange={(event) => setSelectedEmployeeUserId(event.target.value)}>
                <option value="">Select employee</option>
                {tenantUsers.map((tenantUser) => (
                  <option key={tenantUser.id} value={tenantUser.id}>
                    {tenantUser.email}
                  </option>
                ))}
              </select>
              {renderEmployeeProfileFields()}
              <button disabled={loading || !selectedEmployeeUserId}>Save Employee Profile</button>
            </form>
          </section>

          <section className="panel">
            <h2>Employee Roster</h2>
            {tenantUsers.length === 0 ? (
              <p>No employee users in this page.</p>
            ) : (
              <ul className="compact-list">
                {tenantUsers.map((tenantUser) => {
                  const profile = employeeProfiles.find((candidate) => candidate.userId === tenantUser.id);
                  const completeness = profile ? 'Complete' : 'Missing Profile';
                  const eligibility =
                    profile && profile.benefitClass === 'FULL_TIME_ELIGIBLE' && profile.employmentStatus === 'ACTIVE'
                      ? 'Eligible'
                      : 'Ineligible';

                  return (
                    <li key={tenantUser.id}>
                      {tenantUser.email} | {completeness} | {eligibility}
                    </li>
                  );
                })}
              </ul>
            )}
            {renderPageControls(
              tenantUsersPage,
              () => setTenantUsersOffset(Math.max(tenantUsersOffset - PAGE_SIZE, 0)),
              () => setTenantUsersOffset(tenantUsersOffset + PAGE_SIZE),
            )}
          </section>

          <section className="panel">
            <h2>Plan Year + Plan Setup</h2>
            <form onSubmit={handleCreatePlanYear}>
              <label>Plan Year Name</label>
              <input value={planYearName} onChange={(event) => setPlanYearName(event.target.value)} required />
              <label>Start Date</label>
              <input type="date" value={planYearStart} onChange={(event) => setPlanYearStart(event.target.value)} required />
              <label>End Date</label>
              <input type="date" value={planYearEnd} onChange={(event) => setPlanYearEnd(event.target.value)} required />
              <button disabled={loading}>Create Plan Year</button>
            </form>

            <hr />

            <form onSubmit={handleCreatePlan}>
              <label>Plan Year</label>
              <select value={selectedPlanYearId} onChange={(event) => setSelectedPlanYearId(event.target.value)}>
                <option value="">Select plan year</option>
                {planYears.map((planYear) => (
                  <option key={planYear.id} value={planYear.id}>
                    {planYear.name} ({planYear.startDate} - {planYear.endDate})
                  </option>
                ))}
              </select>
              <label>Type</label>
              <select value={planType} onChange={(event) => setPlanType(event.target.value as 'MEDICAL' | 'DENTAL' | 'VISION')}>
                <option value="MEDICAL">MEDICAL</option>
                <option value="DENTAL">DENTAL</option>
                <option value="VISION">VISION</option>
              </select>
              <label>Carrier</label>
              <input value={planCarrier} onChange={(event) => setPlanCarrier(event.target.value)} required />
              <label>Plan Name</label>
              <input value={planName} onChange={(event) => setPlanName(event.target.value)} required />
              <button disabled={loading || !selectedPlanYearId}>Create Plan</button>
            </form>

            <hr />

            <form onSubmit={handleSetPremiums}>
              <label>Plan</label>
              <select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}>
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.type} - {plan.planName}
                  </option>
                ))}
              </select>

              <label>Employee Only - Employee Cost</label>
              <input value={employeeOnlyEmployeeCost} onChange={(event) => setEmployeeOnlyEmployeeCost(event.target.value)} required />
              <label>Employee Only - Employer Cost</label>
              <input value={employeeOnlyEmployerCost} onChange={(event) => setEmployeeOnlyEmployerCost(event.target.value)} required />

              <label>Employee + Spouse - Employee Cost</label>
              <input value={employeeSpouseEmployeeCost} onChange={(event) => setEmployeeSpouseEmployeeCost(event.target.value)} required />
              <label>Employee + Spouse - Employer Cost</label>
              <input value={employeeSpouseEmployerCost} onChange={(event) => setEmployeeSpouseEmployerCost(event.target.value)} required />

              <label>Employee + Child(ren) - Employee Cost</label>
              <input
                value={employeeChildrenEmployeeCost}
                onChange={(event) => setEmployeeChildrenEmployeeCost(event.target.value)}
                required
              />
              <label>Employee + Child(ren) - Employer Cost</label>
              <input
                value={employeeChildrenEmployerCost}
                onChange={(event) => setEmployeeChildrenEmployerCost(event.target.value)}
                required
              />

              <label>Family - Employee Cost</label>
              <input value={familyEmployeeCost} onChange={(event) => setFamilyEmployeeCost(event.target.value)} required />
              <label>Family - Employer Cost</label>
              <input value={familyEmployerCost} onChange={(event) => setFamilyEmployerCost(event.target.value)} required />

              <button disabled={loading || !selectedPlanId}>Set Premiums</button>
            </form>
          </section>

          <section className="panel">
            <h2>Recent Security Events</h2>
            {renderSecurityFilters()}
            <div className="nav-list">
              <button type="button" onClick={() => exportSecurityEventsCsv(companyAdminSecurityEvents)}>
                Export CSV
              </button>
            </div>
            {renderSecurityEventList(companyAdminSecurityEvents)}
            {renderPageControls(
              companyAdminSecurityPage,
              () => setCompanyAdminSecurityOffset(Math.max(companyAdminSecurityOffset - PAGE_SIZE, 0)),
              () => setCompanyAdminSecurityOffset(companyAdminSecurityOffset + PAGE_SIZE),
            )}
          </section>
        </>
      );
    }

    const filteredDraftPlans = plans.filter((plan) => plan.planYearId === draftPlanYearId);
    const submittedEnrollmentForDraftPlanYear = enrollments.find(
      (enrollment) => enrollment.planYearId === draftPlanYearId && enrollment.status === 'SUBMITTED',
    );
    const selectedEnrollment = enrollments.find((enrollment) => enrollment.id === selectedEnrollmentId) ?? null;
    const selectedEnrollmentIsSubmitted = selectedEnrollment?.status === 'SUBMITTED';

    return (
      <>
        <section className="panel">
          <h2>My Profile</h2>
          <form onSubmit={handleSaveEmployeeProfile}>
            {renderEmployeeProfileFields()}
            <button disabled={loading}>Save Profile</button>
          </form>
        </section>

        <section className="panel">
          <h2>Add Dependent</h2>
          <form onSubmit={handleAddDependent}>
            <label>Relationship</label>
            <select value={dependentRelationship} onChange={(event) => setDependentRelationship(event.target.value as 'SPOUSE' | 'CHILD')}>
              <option value="SPOUSE">SPOUSE</option>
              <option value="CHILD">CHILD</option>
            </select>
            <label>First Name</label>
            <input value={dependentFirstName} onChange={(event) => setDependentFirstName(event.target.value)} required />
            <label>Last Name</label>
            <input value={dependentLastName} onChange={(event) => setDependentLastName(event.target.value)} required />
            <label>DOB</label>
            <input type="date" value={dependentDob} onChange={(event) => setDependentDob(event.target.value)} required />
            <button disabled={loading}>Add Dependent</button>
          </form>
        </section>

        <section className="panel">
          <h2>Create Enrollment Draft</h2>
          <form onSubmit={handleCreateDraft}>
            <label>Plan Year</label>
            <select value={draftPlanYearId} onChange={(event) => setDraftPlanYearId(event.target.value)}>
              <option value="">Select plan year</option>
              {planYears.map((planYear) => (
                <option key={planYear.id} value={planYear.id}>
                  {planYear.name}
                </option>
              ))}
            </select>

            <label>Plan</label>
            <select value={draftPlanId} onChange={(event) => setDraftPlanId(event.target.value)}>
              <option value="">Select plan</option>
              {filteredDraftPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.type} - {plan.planName}
                </option>
              ))}
            </select>

            <label>Coverage Tier</label>
            <select
              value={draftCoverageTier}
              onChange={(event) =>
                setDraftCoverageTier(event.target.value as 'EMPLOYEE_ONLY' | 'EMPLOYEE_SPOUSE' | 'EMPLOYEE_CHILDREN' | 'FAMILY')
              }
            >
              <option value="EMPLOYEE_ONLY">EMPLOYEE_ONLY</option>
              <option value="EMPLOYEE_SPOUSE">EMPLOYEE_SPOUSE</option>
              <option value="EMPLOYEE_CHILDREN">EMPLOYEE_CHILDREN</option>
              <option value="FAMILY">FAMILY</option>
            </select>

            <label>Dependents</label>
            <select
              multiple
              value={selectedDependentIds}
              onChange={(event) => {
                const nextIds = Array.from(event.target.selectedOptions).map((option) => option.value);
                setSelectedDependentIds(nextIds);
              }}
              disabled={Boolean(submittedEnrollmentForDraftPlanYear)}
            >
              {dependents.map((dependent) => (
                <option key={dependent.id} value={dependent.id}>
                  {dependent.relationship} - {dependent.firstName} {dependent.lastName}
                </option>
              ))}
            </select>

            <button disabled={loading || !draftPlanId || !draftPlanYearId || Boolean(submittedEnrollmentForDraftPlanYear)}>
              Create Draft
            </button>
          </form>
          {submittedEnrollmentForDraftPlanYear && (
            <p>Enrollment is locked for this plan year because a submitted election already exists.</p>
          )}
        </section>

        <section className="panel">
          <h2>Submit Enrollment</h2>
          <form onSubmit={handleSubmitEnrollment}>
            <label>Enrollment</label>
            <select value={selectedEnrollmentId} onChange={(event) => setSelectedEnrollmentId(event.target.value)}>
              <option value="">Select enrollment</option>
              {enrollments.map((enrollment) => (
                <option key={enrollment.id} value={enrollment.id}>
                  {enrollment.status} - {enrollment.planYearId}
                </option>
              ))}
            </select>
            <button disabled={loading || !selectedEnrollmentId || selectedEnrollmentIsSubmitted}>Submit Enrollment</button>
          </form>
          {selectedEnrollmentIsSubmitted && <p>This enrollment is already submitted and cannot be changed.</p>}
        </section>

        <section className="panel">
          <h2>Enrollment Receipt</h2>
          {selectedEnrollment ? (
            <>
              <p>Status: {selectedEnrollment.status}</p>
              <p>Effective Date: {selectedEnrollment.effectiveDate ?? 'Pending submit'}</p>
              <p>Confirmation: {selectedEnrollment.confirmationCode ?? 'Not submitted'}</p>
              {selectedEnrollment.status === 'SUBMITTED' && <p>Locked: submitted enrollments are read-only.</p>}
              <p>
                Total Employee Monthly: $
                {selectedEnrollment.elections
                  .reduce((sum, election) => sum + election.employeeMonthlyCost, 0)
                  .toFixed(2)}
              </p>
              <p>
                Total Employer Monthly: $
                {selectedEnrollment.elections
                  .reduce((sum, election) => sum + election.employerMonthlyCost, 0)
                  .toFixed(2)}
              </p>
              <ul className="compact-list">
                {selectedEnrollment.elections.map((election) => {
                  const plan = plans.find((candidate) => candidate.id === election.planId);
                  const planLabel = plan ? `${plan.type} - ${plan.planName}` : election.planId;
                  return (
                    <li key={`${selectedEnrollment.id}-${election.planType}`}>
                      {planLabel} | {election.coverageTier} | Employee ${' '}
                      {election.employeeMonthlyCost.toFixed(2)} | Employer ${' '}
                      {election.employerMonthlyCost.toFixed(2)}
                    </li>
                  );
                })}
              </ul>
              <p>Dependents:</p>
              <ul className="compact-list">
                {selectedEnrollment.dependentIds.length === 0 && <li>None</li>}
                {selectedEnrollment.dependentIds.map((dependentId) => {
                  const dependent = dependents.find((candidate) => candidate.id === dependentId);
                  return (
                    <li key={dependentId}>
                      {dependent
                        ? `${dependent.relationship} - ${dependent.firstName} ${dependent.lastName}`
                        : dependentId}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p>Select an enrollment to view receipt details.</p>
          )}
        </section>
      </>
    );
  }

  function renderSecurityEventList(events: SecurityEvent[]) {
    if (events.length === 0) {
      return <p>No events yet.</p>;
    }

    return (
      <ul className="compact-list">
        {events.map((event) => (
          <li key={event.id}>
            [{event.severity}] {event.eventType} | {new Date(event.createdAt).toLocaleString()} | user{' '}
            {event.userId ?? 'unknown'}
          </li>
        ))}
      </ul>
    );
  }

  function renderSecurityFilters() {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label>Severity</label>
        <select
          value={securitySeverityFilter}
          onChange={(event) => {
            setSecuritySeverityFilter(event.target.value as 'INFO' | 'WARN' | 'ERROR' | '');
            setFullAdminSecurityOffset(0);
            setCompanyAdminSecurityOffset(0);
          }}
        >
          <option value="">All</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>

        <label>Event Type Contains</label>
        <input
          value={securityEventTypeFilter}
          onChange={(event) => {
            setSecurityEventTypeFilter(event.target.value);
            setFullAdminSecurityOffset(0);
            setCompanyAdminSecurityOffset(0);
          }}
        />

        <label>Search</label>
        <input
          value={securityQueryFilter}
          onChange={(event) => {
            setSecurityQueryFilter(event.target.value);
            setFullAdminSecurityOffset(0);
            setCompanyAdminSecurityOffset(0);
          }}
        />

        <button
          type="button"
          onClick={() => {
            setSecuritySeverityFilter('');
            setSecurityEventTypeFilter('');
            setSecurityQueryFilter('');
            setFullAdminSecurityOffset(0);
            setCompanyAdminSecurityOffset(0);
          }}
        >
          Clear Filters
        </button>
      </form>
    );
  }

  function renderPageControls(page: PageInfo | null, onPrevious: () => void, onNext: () => void) {
    if (!page) {
      return null;
    }

    return (
      <div className="nav-list">
        <p>
          Offset {page.offset} | Returned {page.returned}
        </p>
        <div className="inline-actions">
          <button type="button" onClick={onPrevious} disabled={page.offset === 0}>
            Previous
          </button>
          <button type="button" onClick={onNext} disabled={!page.hasMore}>
            Next
          </button>
        </div>
      </div>
    );
  }

  function renderEmployeeProfileFields() {
    return (
      <>
        <label>Employee ID</label>
        <input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required />

        <label>First Name</label>
        <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />

        <label>Last Name</label>
        <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />

        <label>DOB</label>
        <input type="date" value={dob} onChange={(event) => setDob(event.target.value)} required />

        <label>Hire Date</label>
        <input type="date" value={hireDate} onChange={(event) => setHireDate(event.target.value)} required />

        <label>Salary Amount</label>
        <input value={salaryAmount} onChange={(event) => setSalaryAmount(event.target.value)} required />

        <label>Benefit Class</label>
        <select value={benefitClass} onChange={(event) => setBenefitClass(event.target.value as 'FULL_TIME_ELIGIBLE' | 'INELIGIBLE')}>
          <option value="FULL_TIME_ELIGIBLE">FULL_TIME_ELIGIBLE</option>
          <option value="INELIGIBLE">INELIGIBLE</option>
        </select>

        <label>Employment Status</label>
        <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value as 'ACTIVE' | 'TERMED')}>
          <option value="ACTIVE">ACTIVE</option>
          <option value="TERMED">TERMED</option>
        </select>
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Benefits Enrollment MVP Console</h1>
        <p>Typed API + role-aware guided workflows.</p>
        <label className="api-label">
          API Base URL
          <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} />
        </label>
      </header>

      {!user && (
        <section className="panel auth-panel">
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <label>Email</label>
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required />
            <label>Password</label>
            <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required />
            <button disabled={loading}>Sign In</button>
          </form>

          <hr />

          <h2>Signup with Invite</h2>
          <form onSubmit={handleSignupInvite}>
            <label>Invite Code</label>
            <input value={signupInviteCode} onChange={(event) => setSignupInviteCode(event.target.value)} required />
            <label>Email</label>
            <input value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} required />
            <label>Password</label>
            <input type="password" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} required />
            <button disabled={loading}>Sign Up</button>
          </form>

          <hr />

          <h2>Password Reset</h2>
          <form onSubmit={handlePasswordResetRequest}>
            <label>Email</label>
            <input value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required />
            <button disabled={loading}>Request Reset</button>
          </form>

          <form onSubmit={handlePasswordResetConfirm}>
            <label>Reset Token</label>
            <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} required />
            <label>New Password</label>
            <input value={resetNewPassword} onChange={(event) => setResetNewPassword(event.target.value)} required />
            <button disabled={loading}>Confirm Reset</button>
          </form>
        </section>
      )}

      {user && (
        <>
          <section className="panel">
            <h2>Session</h2>
            <p>
              <strong>{user.email}</strong> ({user.role})
            </p>
            <p>Tenant: {tenantId ?? 'Platform scope'}</p>
            <div className="nav-list">
              <button onClick={() => void runAction('Refresh data', () => refreshReferenceData())} disabled={loading}>
                Refresh Data
              </button>
              <button onClick={() => void runAction('Logout all sessions', () => api.logoutAll(), () => {
                setUser(null);
                setTokens(null);
              })} disabled={loading}>
                Logout All
              </button>
              <button className="logout" onClick={() => void handleLogout()} disabled={loading}>
                Logout
              </button>
            </div>
          </section>

          <main className="workspace">
            <section className="content">{renderRolePanels()}</section>
          </main>
        </>
      )}

      {(message || error) && (
        <section className="panel response-panel">
          <h2>Status</h2>
          {message && <p>{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </section>
      )}
    </div>
  );
}

function stringifyError(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return 'Unknown error';
}
