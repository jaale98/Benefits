import { FormEvent, useMemo, useState } from 'react';

type Role = 'FULL_ADMIN' | 'COMPANY_ADMIN' | 'EMPLOYEE';

interface SessionUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
}

interface ApiResult {
  status: number;
  body: unknown;
}

type PanelKey =
  | 'full-admin-tenant'
  | 'full-admin-company-invite'
  | 'company-employee-invite'
  | 'company-employee-profile'
  | 'company-plan-year'
  | 'company-plan'
  | 'company-plan-premiums'
  | 'employee-profile'
  | 'employee-dependent'
  | 'employee-draft'
  | 'employee-submit';

const ROLE_PANELS: Record<Role, PanelKey[]> = {
  FULL_ADMIN: ['full-admin-tenant', 'full-admin-company-invite'],
  COMPANY_ADMIN: ['company-employee-invite', 'company-employee-profile', 'company-plan-year', 'company-plan', 'company-plan-premiums'],
  EMPLOYEE: ['employee-profile', 'employee-dependent', 'employee-draft', 'employee-submit'],
};

const PANEL_LABELS: Record<PanelKey, string> = {
  'full-admin-tenant': 'Create Tenant',
  'full-admin-company-invite': 'Company Admin Invite',
  'company-employee-invite': 'Employee Invite',
  'company-employee-profile': 'Set Employee Profile',
  'company-plan-year': 'Create Plan Year',
  'company-plan': 'Create Plan',
  'company-plan-premiums': 'Set Plan Premiums',
  'employee-profile': 'My Profile',
  'employee-dependent': 'Add Dependent',
  'employee-draft': 'Create Enrollment Draft',
  'employee-submit': 'Submit Enrollment',
};

export function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>('');

  const [loginEmail, setLoginEmail] = useState('platform-admin@example.com');
  const [loginPassword, setLoginPassword] = useState('ChangeMe123!');

  const [tenantName, setTenantName] = useState('');
  const [tenantCompanyId, setTenantCompanyId] = useState('');
  const [companyInviteTenantId, setCompanyInviteTenantId] = useState('');
  const [employeeInviteMaxUses, setEmployeeInviteMaxUses] = useState('1');
  const [employeeProfileUserId, setEmployeeProfileUserId] = useState('');

  const [planYearName, setPlanYearName] = useState('2026 Plan Year');
  const [planYearStart, setPlanYearStart] = useState('2026-01-01');
  const [planYearEnd, setPlanYearEnd] = useState('2026-12-31');

  const [planYearId, setPlanYearId] = useState('');
  const [planType, setPlanType] = useState('MEDICAL');
  const [planCarrier, setPlanCarrier] = useState('Aetna');
  const [planName, setPlanName] = useState('Aetna Gold PPO');

  const [premiumsPlanId, setPremiumsPlanId] = useState('');
  const [premiumsJson, setPremiumsJson] = useState(
    JSON.stringify(
      [
        { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
        { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
      ],
      null,
      2,
    ),
  );

  const [employeeId, setEmployeeId] = useState('EMP-001');
  const [firstName, setFirstName] = useState('Taylor');
  const [lastName, setLastName] = useState('Employee');
  const [dob, setDob] = useState('1990-02-01');
  const [hireDate, setHireDate] = useState('2024-01-15');
  const [salaryAmount, setSalaryAmount] = useState('75000');
  const [benefitClass, setBenefitClass] = useState('FULL_TIME_ELIGIBLE');
  const [employmentStatus, setEmploymentStatus] = useState('ACTIVE');

  const [dependentRelationship, setDependentRelationship] = useState('CHILD');
  const [dependentFirstName, setDependentFirstName] = useState('Jordan');
  const [dependentLastName, setDependentLastName] = useState('Dependent');
  const [dependentDob, setDependentDob] = useState('2015-05-01');

  const [draftPlanYearId, setDraftPlanYearId] = useState('');
  const [draftPlanId, setDraftPlanId] = useState('');
  const [draftPlanType, setDraftPlanType] = useState('MEDICAL');
  const [draftCoverageTier, setDraftCoverageTier] = useState('EMPLOYEE_ONLY');
  const [draftDependentIds, setDraftDependentIds] = useState('');
  const [submitEnrollmentId, setSubmitEnrollmentId] = useState('');

  const [panel, setPanel] = useState<PanelKey>('full-admin-tenant');

  const tenantId = useMemo(() => user?.tenantId ?? null, [user]);

  const visiblePanels = user ? ROLE_PANELS[user.role] : [];

  async function callApi(path: string, method: string, body?: unknown): Promise<ApiResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as unknown;
    return { status: response.status, body: json };
  }

  async function runAction(label: string, action: () => Promise<ApiResult>) {
    setLoading(true);
    setError(null);

    try {
      const response = await action();
      setResult(`${label}\nStatus: ${response.status}\n${JSON.stringify(response.body, null, 2)}`);

      if (response.status >= 400) {
        setError(`${label} failed with ${response.status}`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction('Login', async () => {
      const response = await callApi('/auth/login', 'POST', {
        email: loginEmail,
        password: loginPassword,
      });

      if (response.status === 200 && isLoginBody(response.body)) {
        setToken(response.body.accessToken);
        setUser(response.body.user);
        setPanel(ROLE_PANELS[response.body.user.role][0]);
      }

      return response;
    });
  }

  function logout() {
    setToken(null);
    setUser(null);
    setPanel('full-admin-tenant');
    setResult('');
    setError(null);
  }

  function renderPanel() {
    if (!user) {
      return null;
    }

    const scopedTenantId = user.role === 'FULL_ADMIN' ? companyInviteTenantId : tenantId;

    if (panel === 'full-admin-tenant') {
      return (
        <section className="panel">
          <h2>Create Tenant</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Create Tenant', () =>
                callApi('/full-admin/tenants', 'POST', {
                  name: tenantName,
                  companyId: tenantCompanyId || undefined,
                }),
              );
            }}
          >
            <label>Tenant Name</label>
            <input value={tenantName} onChange={(event) => setTenantName(event.target.value)} required />
            <label>Company ID (optional)</label>
            <input value={tenantCompanyId} onChange={(event) => setTenantCompanyId(event.target.value)} />
            <button disabled={loading}>Create Tenant</button>
          </form>
        </section>
      );
    }

    if (panel === 'full-admin-company-invite') {
      return (
        <section className="panel">
          <h2>Create Company Admin Invite</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Create Company Admin Invite', () =>
                callApi(`/full-admin/tenants/${companyInviteTenantId}/invite-codes/company-admin`, 'POST', { maxUses: 1 }),
              );
            }}
          >
            <label>Tenant ID</label>
            <input value={companyInviteTenantId} onChange={(event) => setCompanyInviteTenantId(event.target.value)} required />
            <button disabled={loading}>Create Invite</button>
          </form>
        </section>
      );
    }

    if (!scopedTenantId) {
      return <section className="panel">Tenant ID is required for this action.</section>;
    }

    if (panel === 'company-employee-invite') {
      return (
        <section className="panel">
          <h2>Create Employee Invite</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Create Employee Invite', () =>
                callApi(`/tenants/${scopedTenantId}/company-admin/invite-codes/employee`, 'POST', {
                  maxUses: Number(employeeInviteMaxUses),
                }),
              );
            }}
          >
            <label>Max Uses</label>
            <input value={employeeInviteMaxUses} onChange={(event) => setEmployeeInviteMaxUses(event.target.value)} required />
            <button disabled={loading}>Create Invite</button>
          </form>
        </section>
      );
    }

    if (panel === 'company-employee-profile') {
      return (
        <section className="panel">
          <h2>Set Employee Profile</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Set Employee Profile', () =>
                callApi(`/tenants/${scopedTenantId}/company-admin/employees/${employeeProfileUserId}/profile`, 'PUT', {
                  employeeId,
                  firstName,
                  lastName,
                  dob,
                  hireDate,
                  salaryAmount: Number(salaryAmount),
                  benefitClass,
                  employmentStatus,
                }),
              );
            }}
          >
            <label>Employee User ID</label>
            <input value={employeeProfileUserId} onChange={(event) => setEmployeeProfileUserId(event.target.value)} required />
            {renderEmployeeFields()}
            <button disabled={loading}>Save Profile</button>
          </form>
        </section>
      );
    }

    if (panel === 'company-plan-year') {
      return (
        <section className="panel">
          <h2>Create Plan Year</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Create Plan Year', () =>
                callApi(`/tenants/${scopedTenantId}/company-admin/plan-years`, 'POST', {
                  name: planYearName,
                  startDate: planYearStart,
                  endDate: planYearEnd,
                }),
              );
            }}
          >
            <label>Name</label>
            <input value={planYearName} onChange={(event) => setPlanYearName(event.target.value)} required />
            <label>Start Date</label>
            <input type="date" value={planYearStart} onChange={(event) => setPlanYearStart(event.target.value)} required />
            <label>End Date</label>
            <input type="date" value={planYearEnd} onChange={(event) => setPlanYearEnd(event.target.value)} required />
            <button disabled={loading}>Create Plan Year</button>
          </form>
        </section>
      );
    }

    if (panel === 'company-plan') {
      return (
        <section className="panel">
          <h2>Create Plan</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Create Plan', () =>
                callApi(`/tenants/${scopedTenantId}/company-admin/plans`, 'POST', {
                  planYearId,
                  type: planType,
                  carrier: planCarrier,
                  planName,
                }),
              );
            }}
          >
            <label>Plan Year ID</label>
            <input value={planYearId} onChange={(event) => setPlanYearId(event.target.value)} required />
            <label>Plan Type</label>
            <select value={planType} onChange={(event) => setPlanType(event.target.value)}>
              <option value="MEDICAL">MEDICAL</option>
              <option value="DENTAL">DENTAL</option>
              <option value="VISION">VISION</option>
            </select>
            <label>Carrier</label>
            <input value={planCarrier} onChange={(event) => setPlanCarrier(event.target.value)} required />
            <label>Plan Name</label>
            <input value={planName} onChange={(event) => setPlanName(event.target.value)} required />
            <button disabled={loading}>Create Plan</button>
          </form>
        </section>
      );
    }

    if (panel === 'company-plan-premiums') {
      return (
        <section className="panel">
          <h2>Set Plan Premiums</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const tiers = JSON.parse(premiumsJson) as unknown;
              void runAction('Set Plan Premiums', () =>
                callApi(`/tenants/${scopedTenantId}/company-admin/plans/${premiumsPlanId}/premiums`, 'PUT', { tiers }),
              );
            }}
          >
            <label>Plan ID</label>
            <input value={premiumsPlanId} onChange={(event) => setPremiumsPlanId(event.target.value)} required />
            <label>Tiers JSON</label>
            <textarea value={premiumsJson} onChange={(event) => setPremiumsJson(event.target.value)} rows={8} required />
            <button disabled={loading}>Set Premiums</button>
          </form>
        </section>
      );
    }

    if (panel === 'employee-profile') {
      return (
        <section className="panel">
          <h2>Update My Profile</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Update Employee Profile', () =>
                callApi(`/tenants/${scopedTenantId}/employee/profile`, 'PUT', {
                  employeeId,
                  firstName,
                  lastName,
                  dob,
                  hireDate,
                  salaryAmount: Number(salaryAmount),
                  benefitClass,
                  employmentStatus,
                }),
              );
            }}
          >
            {renderEmployeeFields()}
            <button disabled={loading}>Save Profile</button>
          </form>
        </section>
      );
    }

    if (panel === 'employee-dependent') {
      return (
        <section className="panel">
          <h2>Add Dependent</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void runAction('Add Dependent', () =>
                callApi(`/tenants/${scopedTenantId}/employee/dependents`, 'POST', {
                  relationship: dependentRelationship,
                  firstName: dependentFirstName,
                  lastName: dependentLastName,
                  dob: dependentDob,
                }),
              );
            }}
          >
            <label>Relationship</label>
            <select value={dependentRelationship} onChange={(event) => setDependentRelationship(event.target.value)}>
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
      );
    }

    if (panel === 'employee-draft') {
      return (
        <section className="panel">
          <h2>Create Enrollment Draft</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const dependentIds = draftDependentIds
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);

              void runAction('Create Enrollment Draft', () =>
                callApi(`/tenants/${scopedTenantId}/employee/enrollments/draft`, 'POST', {
                  planYearId: draftPlanYearId,
                  elections: [
                    {
                      planType: draftPlanType,
                      planId: draftPlanId,
                      coverageTier: draftCoverageTier,
                    },
                  ],
                  dependentIds,
                }),
              );
            }}
          >
            <label>Plan Year ID</label>
            <input value={draftPlanYearId} onChange={(event) => setDraftPlanYearId(event.target.value)} required />
            <label>Plan ID</label>
            <input value={draftPlanId} onChange={(event) => setDraftPlanId(event.target.value)} required />
            <label>Plan Type</label>
            <select value={draftPlanType} onChange={(event) => setDraftPlanType(event.target.value)}>
              <option value="MEDICAL">MEDICAL</option>
              <option value="DENTAL">DENTAL</option>
              <option value="VISION">VISION</option>
            </select>
            <label>Coverage Tier</label>
            <select value={draftCoverageTier} onChange={(event) => setDraftCoverageTier(event.target.value)}>
              <option value="EMPLOYEE_ONLY">EMPLOYEE_ONLY</option>
              <option value="EMPLOYEE_SPOUSE">EMPLOYEE_SPOUSE</option>
              <option value="EMPLOYEE_CHILDREN">EMPLOYEE_CHILDREN</option>
              <option value="FAMILY">FAMILY</option>
            </select>
            <label>Dependent IDs (comma separated)</label>
            <input value={draftDependentIds} onChange={(event) => setDraftDependentIds(event.target.value)} />
            <button disabled={loading}>Create Draft</button>
          </form>
        </section>
      );
    }

    return (
      <section className="panel">
        <h2>Submit Enrollment</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runAction('Submit Enrollment', () =>
              callApi(`/tenants/${scopedTenantId}/employee/enrollments/${submitEnrollmentId}/submit`, 'POST', {}),
            );
          }}
        >
          <label>Enrollment ID</label>
          <input value={submitEnrollmentId} onChange={(event) => setSubmitEnrollmentId(event.target.value)} required />
          <button disabled={loading}>Submit Enrollment</button>
        </form>
      </section>
    );
  }

  function renderEmployeeFields() {
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
        <select value={benefitClass} onChange={(event) => setBenefitClass(event.target.value)}>
          <option value="FULL_TIME_ELIGIBLE">FULL_TIME_ELIGIBLE</option>
          <option value="INELIGIBLE">INELIGIBLE</option>
        </select>
        <label>Employment Status</label>
        <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)}>
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
        <p>Role-aware shell for platform admin, company admin, and employee workflows.</p>
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
        </section>
      )}

      {user && (
        <main className="workspace">
          <aside className="sidebar">
            <div className="session-meta">
              <strong>{user.email}</strong>
              <span>{user.role}</span>
              <span>{user.tenantId ?? 'Platform scope'}</span>
            </div>
            <div className="nav-list">
              {visiblePanels.map((entry) => (
                <button
                  key={entry}
                  className={entry === panel ? 'active' : ''}
                  onClick={() => setPanel(entry)}
                >
                  {PANEL_LABELS[entry]}
                </button>
              ))}
            </div>
            <button className="logout" onClick={logout}>
              Logout
            </button>
          </aside>

          <section className="content">{renderPanel()}</section>
        </main>
      )}

      {(error || result) && (
        <section className="panel response-panel">
          <h2>Response</h2>
          {error && <p className="error-text">{error}</p>}
          <pre>{result}</pre>
        </section>
      )}
    </div>
  );
}

function isLoginBody(value: unknown): value is { accessToken: string; user: SessionUser } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.accessToken !== 'string') {
    return false;
  }

  const user = candidate.user as Record<string, unknown> | undefined;
  if (!user) {
    return false;
  }

  return typeof user.id === 'string' && typeof user.email === 'string' && typeof user.role === 'string';
}
