-- Benefits Enrollment MVP initial schema (PostgreSQL)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enums
CREATE TYPE app_role AS ENUM ('FULL_ADMIN', 'COMPANY_ADMIN', 'EMPLOYEE');
CREATE TYPE invite_target_role AS ENUM ('COMPANY_ADMIN', 'EMPLOYEE');
CREATE TYPE benefit_class AS ENUM ('FULL_TIME_ELIGIBLE', 'INELIGIBLE');
CREATE TYPE employment_status AS ENUM ('ACTIVE', 'TERMED');
CREATE TYPE plan_type AS ENUM ('MEDICAL', 'DENTAL', 'VISION');
CREATE TYPE coverage_tier AS ENUM (
  'EMPLOYEE_ONLY',
  'EMPLOYEE_SPOUSE',
  'EMPLOYEE_CHILDREN',
  'FAMILY'
);
CREATE TYPE enrollment_status AS ENUM ('DRAFT', 'SUBMITTED');
CREATE TYPE dependent_relationship AS ENUM ('SPOUSE', 'CHILD');

-- Common updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_id_format CHECK (company_id ~ '^[a-zA-Z0-9_-]{3,32}$')
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role app_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_role_tenant_check CHECK (
    (role = 'FULL_ADMIN' AND tenant_id IS NULL)
    OR
    (role IN ('COMPANY_ADMIN', 'EMPLOYEE') AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX users_id_tenant_id_uniq ON users (id, tenant_id);
CREATE INDEX users_tenant_role_idx ON users (tenant_id, role);

CREATE TABLE invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  code VARCHAR(64) NOT NULL UNIQUE,
  target_role invite_target_role NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invite_code_non_negative_uses CHECK (uses_count >= 0),
  CONSTRAINT invite_code_max_uses_valid CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT invite_code_usage_limit CHECK (max_uses IS NULL OR uses_count <= max_uses)
);

CREATE INDEX invite_codes_tenant_target_idx ON invite_codes (tenant_id, target_role);

CREATE TABLE employee_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id VARCHAR(64) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  hire_date DATE NOT NULL,
  salary_amount NUMERIC(12,2) NOT NULL,
  benefit_class benefit_class NOT NULL,
  employment_status employment_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_salary_non_negative CHECK (salary_amount >= 0),
  CONSTRAINT employee_profile_user_tenant_fk
    FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT employee_id_unique_per_tenant UNIQUE (tenant_id, employee_id)
);

CREATE TABLE plan_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_year_dates_valid CHECK (start_date <= end_date),
  CONSTRAINT plan_year_no_overlap
    EXCLUDE USING GIST (
      tenant_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    )
);

CREATE UNIQUE INDEX plan_years_id_tenant_id_uniq ON plan_years (id, tenant_id);
CREATE INDEX plan_years_tenant_dates_idx ON plan_years (tenant_id, start_date, end_date);

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_year_id UUID NOT NULL,
  type plan_type NOT NULL,
  carrier VARCHAR(120) NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plans_plan_year_tenant_fk
    FOREIGN KEY (plan_year_id, tenant_id) REFERENCES plan_years (id, tenant_id)
);

CREATE UNIQUE INDEX plans_id_tenant_id_plan_year_id_uniq ON plans (id, tenant_id, plan_year_id);
CREATE INDEX plans_tenant_year_type_idx ON plans (tenant_id, plan_year_id, type);

CREATE TABLE plan_premiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  coverage_tier coverage_tier NOT NULL,
  employee_monthly_cost NUMERIC(10,2) NOT NULL,
  employer_monthly_cost NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT premium_employee_cost_non_negative CHECK (employee_monthly_cost >= 0),
  CONSTRAINT premium_employer_cost_non_negative CHECK (employer_monthly_cost >= 0),
  CONSTRAINT plan_coverage_tier_unique UNIQUE (plan_id, coverage_tier)
);

CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_user_id UUID NOT NULL,
  plan_year_id UUID NOT NULL,
  status enrollment_status NOT NULL DEFAULT 'DRAFT',
  effective_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ,
  confirmation_code VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrollment_employee_tenant_fk
    FOREIGN KEY (employee_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT enrollment_plan_year_tenant_fk
    FOREIGN KEY (plan_year_id, tenant_id) REFERENCES plan_years (id, tenant_id),
  CONSTRAINT submitted_enrollment_fields_check CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL)
    OR
    (status = 'SUBMITTED' AND submitted_at IS NOT NULL)
  )
);

CREATE INDEX enrollments_tenant_employee_idx ON enrollments (tenant_id, employee_user_id);
CREATE INDEX enrollments_tenant_status_idx ON enrollments (tenant_id, status);
CREATE UNIQUE INDEX enrollments_one_submitted_per_year_idx
  ON enrollments (employee_user_id, plan_year_id)
  WHERE status = 'SUBMITTED';

CREATE TABLE enrollment_elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  plan_type plan_type NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id),
  coverage_tier coverage_tier NOT NULL,
  employee_monthly_cost NUMERIC(10,2) NOT NULL,
  employer_monthly_cost NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT election_employee_cost_non_negative CHECK (employee_monthly_cost >= 0),
  CONSTRAINT election_employer_cost_non_negative CHECK (employer_monthly_cost >= 0),
  CONSTRAINT enrollment_plan_type_unique UNIQUE (enrollment_id, plan_type)
);

CREATE TABLE dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_user_id UUID NOT NULL,
  relationship dependent_relationship NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  dob DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dependent_employee_tenant_fk
    FOREIGN KEY (employee_user_id, tenant_id) REFERENCES users (id, tenant_id)
);

CREATE INDEX dependents_tenant_employee_idx ON dependents (tenant_id, employee_user_id);

CREATE TABLE enrollment_dependents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  dependent_id UUID NOT NULL REFERENCES dependents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrollment_dependent_unique UNIQUE (enrollment_id, dependent_id)
);

-- Triggers for updated_at
CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER employee_profiles_set_updated_at
BEFORE UPDATE ON employee_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER plan_years_set_updated_at
BEFORE UPDATE ON plan_years
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER plans_set_updated_at
BEFORE UPDATE ON plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER plan_premiums_set_updated_at
BEFORE UPDATE ON plan_premiums
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER enrollments_set_updated_at
BEFORE UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER dependents_set_updated_at
BEFORE UPDATE ON dependents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Business rule: company admins cannot be reassigned to another tenant
CREATE OR REPLACE FUNCTION enforce_company_admin_tenant_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'COMPANY_ADMIN' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'COMPANY_ADMIN tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_company_admin_tenant_immutable
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_company_admin_tenant_immutable();

-- Business rule: invite code creator permissions
CREATE OR REPLACE FUNCTION enforce_invite_code_creator_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  creator_role app_role;
  creator_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO creator_role, creator_tenant
  FROM users
  WHERE id = NEW.created_by_user_id;

  IF creator_role IS NULL THEN
    RAISE EXCEPTION 'Invite code creator does not exist';
  END IF;

  IF NEW.target_role = 'COMPANY_ADMIN' THEN
    IF creator_role <> 'FULL_ADMIN' THEN
      RAISE EXCEPTION 'Only FULL_ADMIN can create COMPANY_ADMIN invite codes';
    END IF;
  ELSIF NEW.target_role = 'EMPLOYEE' THEN
    IF creator_role <> 'COMPANY_ADMIN' THEN
      RAISE EXCEPTION 'Only COMPANY_ADMIN can create EMPLOYEE invite codes';
    END IF;
    IF creator_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'COMPANY_ADMIN can only create employee invites for same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invite_codes_creator_permissions
BEFORE INSERT OR UPDATE ON invite_codes
FOR EACH ROW EXECUTE FUNCTION enforce_invite_code_creator_permissions();

-- Business rule: employee profile must belong to EMPLOYEE user
CREATE OR REPLACE FUNCTION enforce_employee_profile_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  u_role app_role;
BEGIN
  SELECT role INTO u_role FROM users WHERE id = NEW.user_id;
  IF u_role <> 'EMPLOYEE' THEN
    RAISE EXCEPTION 'employee_profiles.user_id must reference an EMPLOYEE user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER employee_profiles_user_role
BEFORE INSERT OR UPDATE ON employee_profiles
FOR EACH ROW EXECUTE FUNCTION enforce_employee_profile_user_role();

-- Business rule: enrollments must belong to EMPLOYEE user
CREATE OR REPLACE FUNCTION enforce_enrollment_employee_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  u_role app_role;
BEGIN
  SELECT role INTO u_role FROM users WHERE id = NEW.employee_user_id;
  IF u_role <> 'EMPLOYEE' THEN
    RAISE EXCEPTION 'enrollments.employee_user_id must reference an EMPLOYEE user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollments_employee_role
BEFORE INSERT OR UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_employee_role();

-- Business rule: submitted enrollment is immutable
CREATE OR REPLACE FUNCTION block_submitted_enrollment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'SUBMITTED' THEN
    RAISE EXCEPTION 'Submitted enrollments are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollments_block_submitted_updates
BEFORE UPDATE ON enrollments
FOR EACH ROW EXECUTE FUNCTION block_submitted_enrollment_mutation();

-- Business rule: elected plan must match enrollment tenant and plan year
CREATE OR REPLACE FUNCTION enforce_election_plan_matches_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  enrollment_tenant UUID;
  enrollment_year UUID;
  plan_tenant UUID;
  plan_year UUID;
  plan_kind plan_type;
BEGIN
  SELECT tenant_id, plan_year_id INTO enrollment_tenant, enrollment_year
  FROM enrollments
  WHERE id = NEW.enrollment_id;

  SELECT tenant_id, plan_year_id, type INTO plan_tenant, plan_year, plan_kind
  FROM plans
  WHERE id = NEW.plan_id;

  IF enrollment_tenant IS NULL OR plan_tenant IS NULL THEN
    RAISE EXCEPTION 'Enrollment or plan not found';
  END IF;

  IF enrollment_tenant IS DISTINCT FROM plan_tenant THEN
    RAISE EXCEPTION 'Election plan tenant does not match enrollment tenant';
  END IF;

  IF enrollment_year IS DISTINCT FROM plan_year THEN
    RAISE EXCEPTION 'Election plan year does not match enrollment plan year';
  END IF;

  IF NEW.plan_type IS DISTINCT FROM plan_kind THEN
    RAISE EXCEPTION 'Election plan_type must match selected plan type';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollment_elections_plan_consistency
BEFORE INSERT OR UPDATE ON enrollment_elections
FOR EACH ROW EXECUTE FUNCTION enforce_election_plan_matches_enrollment();

-- Business rule: dependent relationship and age validation when attached to enrollment
CREATE OR REPLACE FUNCTION enforce_enrollment_dependent_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  dep_employee UUID;
  dep_relationship dependent_relationship;
  dep_dob DATE;
  enrollment_employee UUID;
  enrollment_effective DATE;
  dep_age INT;
BEGIN
  SELECT employee_user_id, relationship, dob
  INTO dep_employee, dep_relationship, dep_dob
  FROM dependents
  WHERE id = NEW.dependent_id;

  SELECT employee_user_id, effective_date
  INTO enrollment_employee, enrollment_effective
  FROM enrollments
  WHERE id = NEW.enrollment_id;

  IF dep_employee IS NULL OR enrollment_employee IS NULL THEN
    RAISE EXCEPTION 'Dependent or enrollment not found';
  END IF;

  IF dep_employee IS DISTINCT FROM enrollment_employee THEN
    RAISE EXCEPTION 'Dependent must belong to the enrollment employee';
  END IF;

  IF dep_relationship = 'CHILD' THEN
    dep_age := EXTRACT(YEAR FROM age(enrollment_effective, dep_dob));
    IF dep_age >= 26 THEN
      RAISE EXCEPTION 'Child dependents must be under age 26 at effective date';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enrollment_dependents_rules
BEFORE INSERT OR UPDATE ON enrollment_dependents
FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_dependent_rules();

COMMIT;
