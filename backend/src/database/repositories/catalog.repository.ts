import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { Database } from '../client.js';
import type { BillingPeriod, PlanFeatures, PlanLimits, ProductStatus } from '../schema/index.js';
import { businessActivities, planVersions, plans, products } from '../schema/index.js';

export interface CatalogActivity {
  code: string;
  name: string;
}

export interface CatalogProduct {
  code: string;
  name: string;
  status: ProductStatus;
  activities: CatalogActivity[];
}

export interface CatalogPlan {
  code: string;
  /** null = the plan applies to every activity of the product. */
  activity: string | null;
  version: number;
  price: { amountMinor: number; currency: string; billingPeriod: BillingPeriod };
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

/**
 * Read-only access to the public catalog (ADR-0003): products, their activities and the CURRENT
 * version of each active plan. This is reference data shared by every visitor, so it is
 * deliberately not tenant-scoped, and it only ever exposes the public fields above (never row
 * ids, never archived plans, never disabled products or activities). Writes belong to the
 * platform-admin module, not here.
 */
export function createCatalogRepository(db: Database['db']) {
  return {
    /** Every product that is not disabled ("coming soon" ones are listed so the site can show them). */
    async listProducts(): Promise<CatalogProduct[]> {
      const rows = await db
        .select({ id: products.id, code: products.code, name: products.name, status: products.status })
        .from(products)
        .where(ne(products.status, 'disabled'))
        .orderBy(asc(products.name), asc(products.code));
      if (rows.length === 0) return [];

      const activities = await db
        .select({
          productId: businessActivities.productId,
          code: businessActivities.code,
          name: businessActivities.name,
        })
        .from(businessActivities)
        .where(
          and(
            inArray(
              businessActivities.productId,
              rows.map((row) => row.id),
            ),
            eq(businessActivities.status, 'active'),
          ),
        )
        .orderBy(asc(businessActivities.name), asc(businessActivities.code));

      return rows.map(({ id, ...product }) => ({
        ...product,
        activities: activities
          .filter((activity) => activity.productId === id)
          .map(({ code, name }) => ({ code, name })),
      }));
    },

    /**
     * Active plans of an AVAILABLE product, each at its current version, cheapest first.
     * With `activityCode`, only plans for that activity plus plans that apply to all activities.
     * Returns null when the product is not available or the activity is unknown/disabled, so the
     * caller answers 404 without saying which of the two was wrong.
     */
    async listPlans(productCode: string, activityCode?: string): Promise<CatalogPlan[] | null> {
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.code, productCode), eq(products.status, 'available')))
        .limit(1);
      if (product === undefined) return null;

      let activityId: string | null = null;
      if (activityCode !== undefined) {
        const [activity] = await db
          .select({ id: businessActivities.id })
          .from(businessActivities)
          .where(
            and(
              eq(businessActivities.productId, product.id),
              eq(businessActivities.code, activityCode),
              eq(businessActivities.status, 'active'),
            ),
          )
          .limit(1);
        if (activity === undefined) return null;
        activityId = activity.id;
      }

      const rows = await db
        .select({
          code: plans.code,
          planActivityId: plans.activityId,
          activityCode: businessActivities.code,
          activityStatus: businessActivities.status,
          version: planVersions.version,
          priceMinor: planVersions.priceMinor,
          currency: planVersions.currency,
          billingPeriod: planVersions.billingPeriod,
          trialDays: planVersions.trialDays,
          limits: planVersions.limits,
          features: planVersions.features,
        })
        .from(plans)
        // The version must be the plan's own: a dangling or foreign current_version_id yields no row.
        .innerJoin(
          planVersions,
          and(eq(planVersions.id, plans.currentVersionId), eq(planVersions.planId, plans.id)),
        )
        .leftJoin(businessActivities, eq(businessActivities.id, plans.activityId))
        .where(and(eq(plans.productId, product.id), eq(plans.status, 'active')))
        .orderBy(asc(planVersions.priceMinor), asc(plans.code));

      return rows
        .filter((row) => row.planActivityId === null || row.activityStatus === 'active')
        .filter(
          (row) => activityId === null || row.planActivityId === null || row.planActivityId === activityId,
        )
        .map((row) => ({
          code: row.code,
          activity: row.activityCode ?? null,
          version: row.version,
          price: {
            amountMinor: row.priceMinor,
            currency: row.currency,
            billingPeriod: row.billingPeriod,
          },
          trialDays: row.trialDays,
          limits: row.limits,
          features: row.features,
        }));
    },
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
