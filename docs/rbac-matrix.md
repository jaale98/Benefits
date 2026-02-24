# RBAC Matrix (MVP)

Roles:

- `FULL_ADMIN`
- `COMPANY_ADMIN`
- `EMPLOYEE`

Legend:

- `Y` = allowed
- `N` = not allowed
- `Tenant-scoped` = allowed only within user's company tenant

| Capability | Full Admin | Company Admin | Employee |
|---|---:|---:|---:|
| View all tenants | Y | N | N |
| Create tenant | Y | N | N |
| Edit tenant metadata | Y | Tenant-scoped | N |
| Create Company Admin invite codes | Y | N | N |
| Create Employee invite codes | N | Y (Tenant-scoped) | N |
| Sign up with invite code | N | Y | Y |
| View users | Y | Tenant-scoped | Self only |
| Create users directly (without invite) | N | N | N |
| Edit Company Admin users | Y | N | N |
| Edit Employee users | Y | Tenant-scoped | Self only (limited profile fields if enabled) |
| Set employee benefit class/status | Y | Tenant-scoped | N |
| Create plan year | Y | Tenant-scoped | N |
| Edit plan year | Y | Tenant-scoped | N |
| Delete plan year | Y | Tenant-scoped | N |
| Create plan (medical/dental/vision) | Y | Tenant-scoped | N |
| Edit plan | Y | Tenant-scoped | N |
| Delete plan | Y | Tenant-scoped | N |
| Configure tier premiums | Y | Tenant-scoped | N |
| Start enrollment draft | Y | Tenant-scoped (for support) | Y (Tenant-scoped) |
| Submit enrollment | Y | N | Y (Tenant-scoped) |
| Edit submitted enrollment | N | N | N |
| Add dependents to enrollment | Y | N | Y (Tenant-scoped) |
| View enrollment confirmation | Y | Tenant-scoped | Y (Self only) |
| Cross-tenant access to company data | Y | N | N |
| Impersonate another user | N | N | N |

## Enforcement Rules

- `COMPANY_ADMIN` and `EMPLOYEE` records are bound to exactly one `tenant_id`.
- `COMPANY_ADMIN` cannot be reassigned to another tenant.
- Every protected query for `COMPANY_ADMIN`/`EMPLOYEE` must include `tenant_id` predicate.
- Role escalation is blocked unless performed by `FULL_ADMIN`.
