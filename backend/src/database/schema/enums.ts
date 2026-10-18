// Status/role value sets. Stored as varchar (not MariaDB ENUM) so migrations stay simple;
// the allowed values are enforced here and by Zod at the API boundary (ADR-0003 §2).

export const tenantStatuses = ['active', 'suspended', 'closed'] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export const userStatuses = ['active', 'invited', 'disabled'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const tenantRoles = ['owner', 'admin', 'member', 'read_only'] as const;
export type TenantRole = (typeof tenantRoles)[number];

export const platformRoles = ['owner', 'admin', 'support'] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const productStatuses = ['available', 'coming_soon', 'disabled'] as const;
export type ProductStatus = (typeof productStatuses)[number];

export const activityStatuses = ['active', 'disabled'] as const;
export type ActivityStatus = (typeof activityStatuses)[number];

export const planStatuses = ['active', 'archived'] as const;
export type PlanStatus = (typeof planStatuses)[number];

export const billingPeriods = ['monthly', 'yearly'] as const;
export type BillingPeriod = (typeof billingPeriods)[number];

export const subscriptionStatuses = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
