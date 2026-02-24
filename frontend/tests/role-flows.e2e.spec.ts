import { expect, test, type APIRequestContext } from '@playwright/test';

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('http://127.0.0.1:4000/auth/login', {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe.configure({ mode: 'serial' });

test('company admin can sign up with invite code in UI', async ({ page, request }) => {
  const suffix = Date.now();
  const fullAdmin = await apiLogin(request, 'platform-admin@example.com', 'ChangeMe123!');

  const tenantRes = await request.post('http://127.0.0.1:4000/full-admin/tenants', {
    headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
    data: { name: `Signup Tenant ${suffix}`, companyId: `signup-${suffix}` },
  });
  expect(tenantRes.ok()).toBeTruthy();
  const tenant = await tenantRes.json();

  const companyInviteRes = await request.post(
    `http://127.0.0.1:4000/full-admin/tenants/${tenant.tenant.id}/invite-codes/company-admin`,
    {
      headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  expect(companyInviteRes.ok()).toBeTruthy();
  const companyInvite = await companyInviteRes.json();

  const companyAdminEmail = `ui-signup-admin-${suffix}@example.com`;

  await page.goto('/');
  const signupForm = page.locator('.auth-panel form').nth(1);
  await signupForm.locator('input').nth(0).fill(companyInvite.inviteCode.code);
  await signupForm.locator('input').nth(1).fill(companyAdminEmail);
  await signupForm.locator('input').nth(2).fill('StrongPass123!');
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page.getByText('Session')).toBeVisible();
  await expect(page.getByText(companyAdminEmail)).toBeVisible();
  await expect(page.getByText('Create Employee Invite')).toBeVisible();
});

test('full admin can login and create tenant in UI', async ({ page }) => {
  const suffix = Date.now();

  await page.goto('/');
  const loginForm = page.locator('.auth-panel form').first();
  await loginForm.locator('input').nth(0).fill('platform-admin@example.com');
  await loginForm.locator('input[type=\"password\"]').nth(0).fill('ChangeMe123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Session')).toBeVisible();

  const createTenantPanel = page.locator('.panel').filter({ has: page.getByText('Create Tenant') }).first();
  await createTenantPanel.locator('input').nth(0).fill(`E2E Tenant ${suffix}`);
  await createTenantPanel.locator('input').nth(1).fill(`e2e-${suffix}`);
  await page.getByRole('button', { name: 'Create Tenant' }).click();

  await expect(page.getByText('Create tenant succeeded.')).toBeVisible();
});

test('company admin can login and create a plan year in UI', async ({ page, request }) => {
  const suffix = Date.now();

  const fullAdmin = await apiLogin(request, 'platform-admin@example.com', 'ChangeMe123!');

  const tenantRes = await request.post('http://127.0.0.1:4000/full-admin/tenants', {
    headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
    data: { name: `Company Admin Tenant ${suffix}`, companyId: `ca-${suffix}` },
  });
  expect(tenantRes.ok()).toBeTruthy();
  const tenant = await tenantRes.json();

  const companyInviteRes = await request.post(
    `http://127.0.0.1:4000/full-admin/tenants/${tenant.tenant.id}/invite-codes/company-admin`,
    {
      headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  expect(companyInviteRes.ok()).toBeTruthy();
  const companyInvite = await companyInviteRes.json();

  const companyAdminEmail = `company-admin-e2e-${suffix}@example.com`;
  const signupRes = await request.post('http://127.0.0.1:4000/auth/signup-invite', {
    data: {
      inviteCode: companyInvite.inviteCode.code,
      email: companyAdminEmail,
      password: 'StrongPass123!',
    },
  });
  expect(signupRes.ok()).toBeTruthy();

  await page.goto('/');
  const loginForm = page.locator('.auth-panel form').first();
  await loginForm.locator('input').nth(0).fill(companyAdminEmail);
  await loginForm.locator('input[type=\"password\"]').nth(0).fill('StrongPass123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Session')).toBeVisible();
  await page.getByRole('button', { name: 'Create Plan Year' }).click();

  await expect(page.getByText('Create plan year succeeded.')).toBeVisible();
});

test('employee can login and create enrollment draft in UI', async ({ page, request }) => {
  const suffix = Date.now();

  const fullAdmin = await apiLogin(request, 'platform-admin@example.com', 'ChangeMe123!');

  const tenantRes = await request.post('http://127.0.0.1:4000/full-admin/tenants', {
    headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
    data: { name: `Employee Tenant ${suffix}`, companyId: `emp-${suffix}` },
  });
  expect(tenantRes.ok()).toBeTruthy();
  const tenant = await tenantRes.json();

  const companyInviteRes = await request.post(
    `http://127.0.0.1:4000/full-admin/tenants/${tenant.tenant.id}/invite-codes/company-admin`,
    {
      headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  const companyInvite = await companyInviteRes.json();

  const companyAdminSignupRes = await request.post('http://127.0.0.1:4000/auth/signup-invite', {
    data: {
      inviteCode: companyInvite.inviteCode.code,
      email: `ca-employee-${suffix}@example.com`,
      password: 'StrongPass123!',
    },
  });
  expect(companyAdminSignupRes.ok()).toBeTruthy();
  const companyAdminSignup = await companyAdminSignupRes.json();

  const employeeInviteRes = await request.post(
    `http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/invite-codes/employee`,
    {
      headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  expect(employeeInviteRes.ok()).toBeTruthy();
  const employeeInvite = await employeeInviteRes.json();

  const employeeEmail = `employee-e2e-${suffix}@example.com`;
  const employeeSignupRes = await request.post('http://127.0.0.1:4000/auth/signup-invite', {
    data: {
      inviteCode: employeeInvite.inviteCode.code,
      email: employeeEmail,
      password: 'StrongPass123!',
    },
  });
  expect(employeeSignupRes.ok()).toBeTruthy();

  const planYearRes = await request.post(`http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plan-years`, {
    headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
    data: {
      name: '2027 Plan Year',
      startDate: '2027-01-01',
      endDate: '2027-12-31',
    },
  });
  expect(planYearRes.ok()).toBeTruthy();
  const planYear = await planYearRes.json();

  const planRes = await request.post(`http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plans`, {
    headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
    data: {
      planYearId: planYear.planYear.id,
      type: 'MEDICAL',
      carrier: 'Aetna',
      planName: 'Aetna Gold PPO',
    },
  });
  expect(planRes.ok()).toBeTruthy();
  const plan = await planRes.json();

  const premiumsRes = await request.put(
    `http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plans/${plan.plan.id}/premiums`,
    {
      headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
      data: {
        tiers: [
          { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
          { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
        ],
      },
    },
  );
  expect(premiumsRes.ok()).toBeTruthy();

  await page.goto('/');
  const loginForm = page.locator('.auth-panel form').first();
  await loginForm.locator('input').nth(0).fill(employeeEmail);
  await loginForm.locator('input[type=\"password\"]').nth(0).fill('StrongPass123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Session')).toBeVisible();

  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Save profile succeeded.')).toBeVisible();

  await page.getByRole('button', { name: 'Create Draft' }).click();
  await expect(page.getByText('Create enrollment draft succeeded.')).toBeVisible();
});

test('employee gets tier/dependent validation error in UI', async ({ page, request }) => {
  const suffix = Date.now();

  const fullAdmin = await apiLogin(request, 'platform-admin@example.com', 'ChangeMe123!');

  const tenantRes = await request.post('http://127.0.0.1:4000/full-admin/tenants', {
    headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
    data: { name: `Validation Tenant ${suffix}`, companyId: `val-${suffix}` },
  });
  expect(tenantRes.ok()).toBeTruthy();
  const tenant = await tenantRes.json();

  const companyInviteRes = await request.post(
    `http://127.0.0.1:4000/full-admin/tenants/${tenant.tenant.id}/invite-codes/company-admin`,
    {
      headers: { Authorization: `Bearer ${fullAdmin.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  expect(companyInviteRes.ok()).toBeTruthy();
  const companyInvite = await companyInviteRes.json();

  const companyAdminSignupRes = await request.post('http://127.0.0.1:4000/auth/signup-invite', {
    data: {
      inviteCode: companyInvite.inviteCode.code,
      email: `ca-validation-${suffix}@example.com`,
      password: 'StrongPass123!',
    },
  });
  expect(companyAdminSignupRes.ok()).toBeTruthy();
  const companyAdminSignup = await companyAdminSignupRes.json();

  const employeeInviteRes = await request.post(
    `http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/invite-codes/employee`,
    {
      headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
      data: { maxUses: 1 },
    },
  );
  expect(employeeInviteRes.ok()).toBeTruthy();
  const employeeInvite = await employeeInviteRes.json();

  const employeeEmail = `employee-validation-${suffix}@example.com`;
  const employeeSignupRes = await request.post('http://127.0.0.1:4000/auth/signup-invite', {
    data: {
      inviteCode: employeeInvite.inviteCode.code,
      email: employeeEmail,
      password: 'StrongPass123!',
    },
  });
  expect(employeeSignupRes.ok()).toBeTruthy();

  const planYearRes = await request.post(`http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plan-years`, {
    headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
    data: {
      name: '2029 Plan Year',
      startDate: '2029-01-01',
      endDate: '2029-12-31',
    },
  });
  expect(planYearRes.ok()).toBeTruthy();
  const planYear = await planYearRes.json();

  const planRes = await request.post(`http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plans`, {
    headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
    data: {
      planYearId: planYear.planYear.id,
      type: 'MEDICAL',
      carrier: 'Aetna',
      planName: 'Aetna Validation PPO',
    },
  });
  expect(planRes.ok()).toBeTruthy();
  const plan = await planRes.json();

  const premiumsRes = await request.put(
    `http://127.0.0.1:4000/tenants/${tenant.tenant.id}/company-admin/plans/${plan.plan.id}/premiums`,
    {
      headers: { Authorization: `Bearer ${companyAdminSignup.accessToken}` },
      data: {
        tiers: [
          { coverageTier: 'EMPLOYEE_ONLY', employeeMonthlyCost: 120, employerMonthlyCost: 480 },
          { coverageTier: 'EMPLOYEE_SPOUSE', employeeMonthlyCost: 240, employerMonthlyCost: 760 },
          { coverageTier: 'EMPLOYEE_CHILDREN', employeeMonthlyCost: 260, employerMonthlyCost: 840 },
          { coverageTier: 'FAMILY', employeeMonthlyCost: 420, employerMonthlyCost: 980 },
        ],
      },
    },
  );
  expect(premiumsRes.ok()).toBeTruthy();

  await page.goto('/');
  const loginForm = page.locator('.auth-panel form').first();
  await loginForm.locator('input').nth(0).fill(employeeEmail);
  await loginForm.locator('input[type=\"password\"]').nth(0).fill('StrongPass123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText('Session')).toBeVisible();
  await page.getByRole('button', { name: 'Save Profile' }).click();
  await expect(page.getByText('Save profile succeeded.')).toBeVisible();

  const draftPanel = page.locator('.panel').filter({ has: page.getByText('Create Enrollment Draft') }).first();
  await draftPanel.locator('select').nth(2).selectOption('EMPLOYEE_SPOUSE');
  await draftPanel.getByRole('button', { name: 'Create Draft' }).click();

  await expect(page.getByText(/EMPLOYEE_SPOUSE coverage requires exactly one spouse and no children/)).toBeVisible();
});
