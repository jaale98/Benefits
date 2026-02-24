import type { CoverageTier, DependentRelationship } from '../types/domain.js';
import { HttpError } from '../types/http-error.js';

interface DependentSelection {
  id: string;
  relationship: DependentRelationship;
}

interface ValidationInput {
  electionCoverageTiers: CoverageTier[];
  dependents: DependentSelection[];
}

export function validateEnrollmentCoverageSelection(input: ValidationInput): void {
  const spouseCount = input.dependents.filter((dependent) => dependent.relationship === 'SPOUSE').length;
  const childCount = input.dependents.filter((dependent) => dependent.relationship === 'CHILD').length;

  for (const tier of new Set(input.electionCoverageTiers)) {
    switch (tier) {
      case 'EMPLOYEE_ONLY': {
        if (spouseCount !== 0 || childCount !== 0) {
          throw new HttpError(422, 'EMPLOYEE_ONLY coverage cannot include dependents');
        }
        break;
      }
      case 'EMPLOYEE_SPOUSE': {
        if (spouseCount !== 1 || childCount !== 0) {
          throw new HttpError(422, 'EMPLOYEE_SPOUSE coverage requires exactly one spouse and no children');
        }
        break;
      }
      case 'EMPLOYEE_CHILDREN': {
        if (spouseCount !== 0 || childCount < 1) {
          throw new HttpError(422, 'EMPLOYEE_CHILDREN coverage requires one or more children and no spouse');
        }
        break;
      }
      case 'FAMILY': {
        if (spouseCount !== 1 || childCount < 1) {
          throw new HttpError(422, 'FAMILY coverage requires exactly one spouse and one or more children');
        }
        break;
      }
      default: {
        throw new HttpError(400, `Unsupported coverage tier: ${String(tier)}`);
      }
    }
  }
}

export function assertUniqueDependentIds(dependentIds: string[]): void {
  const uniqueIds = new Set(dependentIds);
  if (uniqueIds.size !== dependentIds.length) {
    throw new HttpError(422, 'Duplicate dependentIds are not allowed in an enrollment');
  }
}
