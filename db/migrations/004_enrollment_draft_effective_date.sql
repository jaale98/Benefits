BEGIN;

ALTER TABLE enrollments
  ALTER COLUMN effective_date DROP NOT NULL;

ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS submitted_enrollment_fields_check;

ALTER TABLE enrollments
  ADD CONSTRAINT submitted_enrollment_fields_check CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL AND confirmation_code IS NULL)
    OR
    (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND effective_date IS NOT NULL AND confirmation_code IS NOT NULL)
  );

UPDATE enrollments
SET effective_date = NULL
WHERE status = 'DRAFT';

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

  IF dep_relationship = 'CHILD' AND enrollment_effective IS NOT NULL THEN
    dep_age := EXTRACT(YEAR FROM age(enrollment_effective, dep_dob));
    IF dep_age >= 26 THEN
      RAISE EXCEPTION 'Child dependents must be under age 26 at effective date';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
