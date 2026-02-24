# Data Model (MVP)

Relational model targeting PostgreSQL.

## 1. Core Entities

## `tenants`

Purpose: Company-level partition boundary.

Fields:

- `id` (uuid, pk)
- `company_id` (varchar(32), unique, not null)
- `name` (varchar(255), not null)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- `company_id` unique globally.
- `company_id` format: `^[a-zA-Z0-9_-]+$` and length 3-32.

## `users`

Purpose: Auth identity + role assignment.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, nullable only for `FULL_ADMIN`)
- `email` (citext, unique, not null)
- `password_hash` (text, not null)
- `role` (enum: `FULL_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE`)
- `is_active` (boolean, default true)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- `FULL_ADMIN` may have `tenant_id = null`.
- `COMPANY_ADMIN` and `EMPLOYEE` must have `tenant_id not null`.
- `COMPANY_ADMIN` tenant immutable after creation.

## `invite_codes`

Purpose: Controlled self-signup.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `code` (varchar(64), unique, not null)
- `target_role` (enum: `COMPANY_ADMIN`, `EMPLOYEE`)
- `created_by_user_id` (uuid, fk -> users.id, not null)
- `expires_at` (timestamptz, nullable)
- `max_uses` (int, nullable)
- `uses_count` (int, not null, default 0)
- `is_active` (boolean, not null, default true)
- `created_at` (timestamptz, not null)

Constraints:

- `target_role=COMPANY_ADMIN` can only be created by `FULL_ADMIN`.
- `target_role=EMPLOYEE` can only be created by `COMPANY_ADMIN` for same tenant.
- Validity check at signup: active, not expired, within max uses.

## `employee_profiles`

Purpose: Required HR/eligibility fields for employee users.

Fields:

- `user_id` (uuid, pk, fk -> users.id)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `employee_id` (varchar(64), not null)
- `first_name` (varchar(100), not null)
- `last_name` (varchar(100), not null)
- `dob` (date, not null)
- `hire_date` (date, not null)
- `salary_amount` (numeric(12,2), not null)
- `benefit_class` (enum: `FULL_TIME_ELIGIBLE`, `INELIGIBLE`)
- `employment_status` (enum: `ACTIVE`, `TERMED`)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- One profile per employee user.
- Unique (`tenant_id`, `employee_id`).

Derived logic:

- Eligible iff `benefit_class=FULL_TIME_ELIGIBLE` and `employment_status=ACTIVE`.
- Enrollment effective date:
  - If hire month == current month: first day of next month.
  - Else: current date.

## 2. Benefits Configuration

## `plan_years`

Purpose: Tenant enrollment configuration periods.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `name` (varchar(64), not null)  -- e.g., "2026 Plan Year"
- `start_date` (date, not null)
- `end_date` (date, not null)
- `created_by_user_id` (uuid, fk -> users.id, not null)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- `start_date <= end_date`.
- No overlap per tenant:
  - Exclusion constraint on daterange (`start_date`, `end_date`, inclusive) by `tenant_id`.

## `plans`

Purpose: Benefit plans by type.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `plan_year_id` (uuid, fk -> plan_years.id, not null)
- `type` (enum: `MEDICAL`, `DENTAL`, `VISION`)
- `carrier` (varchar(120), not null)
- `plan_name` (varchar(120), not null)
- `is_active` (boolean, not null, default true)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- `plans.tenant_id` must match `plan_years.tenant_id`.
- No strict uniqueness on plan name.

## `plan_premiums`

Purpose: Monthly premium table by coverage tier.

Fields:

- `id` (uuid, pk)
- `plan_id` (uuid, fk -> plans.id, not null)
- `coverage_tier` (enum: `EMPLOYEE_ONLY`, `EMPLOYEE_SPOUSE`, `EMPLOYEE_CHILDREN`, `FAMILY`)
- `employee_monthly_cost` (numeric(10,2), not null)
- `employer_monthly_cost` (numeric(10,2), not null)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- Unique (`plan_id`, `coverage_tier`).
- Costs must be >= 0.

## 3. Enrollment

## `enrollments`

Purpose: Employee election container.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `employee_user_id` (uuid, fk -> users.id, not null)
- `plan_year_id` (uuid, fk -> plan_years.id, not null)
- `status` (enum: `DRAFT`, `SUBMITTED`)
- `effective_date` (date, not null)
- `submitted_at` (timestamptz, nullable)
- `confirmation_code` (varchar(32), nullable)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- One submitted enrollment per employee per plan year:
  - Unique partial index on (`employee_user_id`, `plan_year_id`) where `status='SUBMITTED'`.
- `effective_date` calculated by eligibility rule at submit time.

## `enrollment_elections`

Purpose: One selected plan per supported benefit type.

Fields:

- `id` (uuid, pk)
- `enrollment_id` (uuid, fk -> enrollments.id, not null)
- `plan_type` (enum: `MEDICAL`, `DENTAL`, `VISION`)
- `plan_id` (uuid, fk -> plans.id, not null)
- `coverage_tier` (enum: `EMPLOYEE_ONLY`, `EMPLOYEE_SPOUSE`, `EMPLOYEE_CHILDREN`, `FAMILY`)
- `employee_monthly_cost` (numeric(10,2), not null) -- snapshot at submission
- `employer_monthly_cost` (numeric(10,2), not null) -- snapshot at submission
- `created_at` (timestamptz, not null)

Constraints:

- Unique (`enrollment_id`, `plan_type`).
- `plan_id` must belong to enrollment's tenant and plan year.

## `dependents`

Purpose: Employee dependent records used for elections.

Fields:

- `id` (uuid, pk)
- `tenant_id` (uuid, fk -> tenants.id, not null)
- `employee_user_id` (uuid, fk -> users.id, not null)
- `relationship` (enum: `SPOUSE`, `CHILD`)
- `first_name` (varchar(100), not null)
- `last_name` (varchar(100), not null)
- `dob` (date, not null)
- `created_at` (timestamptz, not null)
- `updated_at` (timestamptz, not null)

Constraints:

- Child age must be < 26 as of enrollment effective date when included in enrollment.

## `enrollment_dependents`

Purpose: Join dependents to enrollment with snapshot semantics.

Fields:

- `id` (uuid, pk)
- `enrollment_id` (uuid, fk -> enrollments.id, not null)
- `dependent_id` (uuid, fk -> dependents.id, not null)
- `created_at` (timestamptz, not null)

Constraints:

- Unique (`enrollment_id`, `dependent_id`).

## 4. Key Relationship Diagram (Text)

- `tenants` 1->many `users`
- `tenants` 1->many `plan_years`
- `plan_years` 1->many `plans`
- `plans` 1->many `plan_premiums`
- `users(EMPLOYEE)` 1->1 `employee_profiles`
- `users(EMPLOYEE)` 1->many `dependents`
- `users(EMPLOYEE)` 1->many `enrollments`
- `enrollments` 1->many `enrollment_elections`
- `enrollments` many->many `dependents` via `enrollment_dependents`
- `users` 1->many `invite_codes` (creator)

## 5. API/Validation Notes for Build Start

- Enforce tenant-scoped reads/writes at service layer and DB query filters.
- Recompute eligibility and effective date at enrollment submit, not client-side only.
- On `SUBMITTED`, freeze elected premium values into `enrollment_elections`.
- Block mutation of submitted enrollments.
