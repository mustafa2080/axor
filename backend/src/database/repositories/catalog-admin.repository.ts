import { and, asc, desc, eq } from 'drizzle-orm';
import { badRequest, conflict, notFound } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { isDuplicateEntry } from '../errors.js';
import type {
  ActivityStatus,
  BillingPeriod,
  PlanFeatures,
  PlanLimits,
  PlanStatus,
  ProductStatus,
} from '../schema/index.js';
import {
  auditLogs,
  businessActivities,
  planVersions,
  plans,
  products,
} from '../schema/index.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

type Exec = Pick<Database['db'], 'select'>;
type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/** Who is making the change. Always taken from the authenticated principal, never the body. */
export interface AdminContext {
  actorUserId: string;
  requestId?: string;
}

export interface AdminActivity {
  id: string;
  code: string;
  name: string;
  status: ActivityStatus;
}

export interface AdminPlanVersion {
  id: string;
  version: number;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
  createdAt: Date;
}

export interface AdminPlan {
  id: string;
  code: string;
  /** null = the plan applies to every activity of the product. */
  activityId: string | null;
  status: PlanStatus;
  currentVersionId: string | null;
  versions: AdminPlanVersion[];
}

export interface AdminProduct {
  id: string;
  code: string;
  name: string;
  status: ProductStatus;
  activities: AdminActivity[];
  plans: AdminPlan[];
}

export interface VersionSpec {
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

const toVersion = (row: typeof planVersions.$inferSelect): AdminPlanVersion => ({
  id: row.id,
  version: row.version,
  priceMinor: row.priceMinor,
  currency: row.currency,
  billingPeriod: row.billingPeriod,
  trialDays: row.trialDays,
  limits: row.limits,
  features: row.features,
  createdAt: row.createdAt,
});

const toPlan = (
  row: typeof plans.$inferSelect,
  versions: Array<typeof planVersions.$inferSelect>,
): AdminPlan => ({
  id: row.id,
  code: row.code,
  activityId: row.activityId,
  status: row.status,
  currentVersionId: row.currentVersionId,
  versions: versions.filter((v) => v.planId === row.id).map(toVersion),
});

const toActivity = (row: typeof businessActivities.$inferSelect): AdminActivity => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status,
});

/** One audit row per administrative change, written in the SAME transaction as the change. */
async function audit(
  tx: Tx,
  ctx: AdminContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  assertSafeMetadata(metadata);
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    actorUserId: ctx.actorUserId,
    tenantId: null,
    action,
    targetType,
    targetId,
    metadata,
    requestId: ctx.requestId ?? null,
  });
}

async function loadProduct(exec: Exec, productId: string): Promise<AdminProduct | null> {
  const [product] = await exec.select().from(products).where(eq(products.id, productId)).limit(1);
  if (product === undefined) return null;
  const activities = await exec
    .select()
    .from(businessActivities)
    .where(eq(businessActivities.productId, productId))
    .orderBy(asc(businessActivities.name));
  const planRows = await exec
    .select()
    .from(plans)
    .where(eq(plans.productId, productId))
    .orderBy(asc(plans.code));
  const versions =
    planRows.length === 0
      ? []
      : await exec
          .select({ v: planVersions })
          .from(planVersions)
          .innerJoin(plans, eq(plans.id, planVersions.planId))
          .where(eq(plans.productId, productId))
          .orderBy(asc(planVersions.version))
          .then((rows) => rows.map((r) => r.v));
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    status: product.status,
    activities: activities.map(toActivity),
    plans: planRows.map((row) => toPlan(row, versions)),
  };
}

async function loadPlan(exec: Exec, planId: string): Promise<AdminPlan | null> {
  const [row] = await exec.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (row === undefined) return null;
  const versions = await exec
    .select()
    .from(planVersions)
    .where(eq(planVersions.planId, planId))
    .orderBy(asc(planVersions.version));
  return toPlan(row, versions);
}

/**
 * Catalog management for platform staff (ADR-0006). Callers must already have authorized
 * `platform:plans:manage`. Rules enforced here, whatever the caller does:
 *  - codes are immutable once created (the public catalog and future integrations key on them);
 *  - plan versions are immutable: a price/limit change inserts a NEW version and makes it current;
 *  - every change writes an audit row in the same transaction (no change without a trace).
 */
export function createCatalogAdminRepository(db: Database['db']) {
  return {
    /** Everything, including disabled products/activities and archived plans, with all versions. */
    async listCatalog(): Promise<AdminProduct[]> {
      const rows = await db.select({ id: products.id }).from(products).orderBy(asc(products.name));
      const result: AdminProduct[] = [];
      for (const { id } of rows) {
        const product = await loadProduct(db, id);
        if (product !== null) result.push(product);
      }
      return result;
    },

    async createProduct(
      ctx: AdminContext,
      input: { code: string; name: string; status: ProductStatus },
    ): Promise<AdminProduct> {
      const id = uuidv7();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(products).values({ id, ...input });
          await audit(tx, ctx, 'catalog.product_created', 'product', id, { ...input });
        });
      } catch (error) {
        if (isDuplicateEntry(error)) throw conflict('A product with this code already exists');
        throw error;
      }
      return (await loadProduct(db, id)) as AdminProduct;
    },

    async updateProduct(
      ctx: AdminContext,
      productId: string,
      changes: { name?: string; status?: ProductStatus },
    ): Promise<AdminProduct> {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1)
          .for('update');
        if (current === undefined) throw notFound('Product not found');
        await tx.update(products).set(changes).where(eq(products.id, productId));
        await audit(tx, ctx, 'catalog.product_updated', 'product', productId, { ...changes });
      });
      return (await loadProduct(db, productId)) as AdminProduct;
    },

    async createActivity(
      ctx: AdminContext,
      productId: string,
      input: { code: string; name: string; status: ActivityStatus },
    ): Promise<AdminActivity> {
      const id = uuidv7();
      try {
        await db.transaction(async (tx) => {
          const [product] = await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.id, productId))
            .limit(1);
          if (product === undefined) throw notFound('Product not found');
          await tx.insert(businessActivities).values({ id, productId, ...input });
          await audit(tx, ctx, 'catalog.activity_created', 'activity', id, { productId, ...input });
        });
      } catch (error) {
        if (isDuplicateEntry(error)) throw conflict('An activity with this code already exists');
        throw error;
      }
      const [row] = await db
        .select()
        .from(businessActivities)
        .where(eq(businessActivities.id, id))
        .limit(1);
      return toActivity(row as typeof businessActivities.$inferSelect);
    },

    async updateActivity(
      ctx: AdminContext,
      activityId: string,
      changes: { name?: string; status?: ActivityStatus },
    ): Promise<AdminActivity> {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: businessActivities.id })
          .from(businessActivities)
          .where(eq(businessActivities.id, activityId))
          .limit(1)
          .for('update');
        if (current === undefined) throw notFound('Activity not found');
        await tx.update(businessActivities).set(changes).where(eq(businessActivities.id, activityId));
        await audit(tx, ctx, 'catalog.activity_updated', 'activity', activityId, { ...changes });
      });
      const [row] = await db
        .select()
        .from(businessActivities)
        .where(eq(businessActivities.id, activityId))
        .limit(1);
      return toActivity(row as typeof businessActivities.$inferSelect);
    },

    /** Creates the plan and its version 1 (current) in one transaction. */
    async createPlan(
      ctx: AdminContext,
      productId: string,
      input: { code: string; activityCode: string | null; status: PlanStatus; version: VersionSpec },
    ): Promise<AdminPlan> {
      const planId = uuidv7();
      const versionId = uuidv7();
      try {
        await db.transaction(async (tx) => {
          const [product] = await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.id, productId))
            .limit(1);
          if (product === undefined) throw notFound('Product not found');

          let activityId: string | null = null;
          if (input.activityCode !== null) {
            const [activity] = await tx
              .select({ id: businessActivities.id })
              .from(businessActivities)
              .where(
                and(
                  eq(businessActivities.productId, productId),
                  eq(businessActivities.code, input.activityCode),
                ),
              )
              .limit(1);
            if (activity === undefined) throw badRequest('Unknown activity for this product');
            activityId = activity.id;
          }

          await tx.insert(plans).values({
            id: planId,
            productId,
            activityId,
            code: input.code,
            status: input.status,
          });
          await tx.insert(planVersions).values({ id: versionId, planId, version: 1, ...input.version });
          await tx.update(plans).set({ currentVersionId: versionId }).where(eq(plans.id, planId));
          await audit(tx, ctx, 'catalog.plan_created', 'plan', planId, {
            productId,
            code: input.code,
            activityCode: input.activityCode,
            status: input.status,
            version: 1,
            priceMinor: input.version.priceMinor,
            currency: input.version.currency,
          });
        });
      } catch (error) {
        if (isDuplicateEntry(error)) throw conflict('A plan with this code already exists');
        throw error;
      }
      return (await loadPlan(db, planId)) as AdminPlan;
    },

    /**
     * Price, limits or features change: inserts the NEXT version and makes it current. Existing
     * versions are never touched. Subscriptions that are not pinned follow the current version
     * (ADR-0003 #4), so this takes effect for them at once.
     */
    async addVersion(ctx: AdminContext, planId: string, spec: VersionSpec): Promise<AdminPlan> {
      await db.transaction(async (tx) => {
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, planId))
          .limit(1)
          .for('update');
        if (plan === undefined) throw notFound('Plan not found');
        const [latest] = await tx
          .select({ version: planVersions.version })
          .from(planVersions)
          .where(eq(planVersions.planId, planId))
          .orderBy(desc(planVersions.version))
          .limit(1);
        const version = (latest?.version ?? 0) + 1;
        const versionId = uuidv7();
        await tx.insert(planVersions).values({ id: versionId, planId, version, ...spec });
        await tx.update(plans).set({ currentVersionId: versionId }).where(eq(plans.id, planId));
        await audit(tx, ctx, 'catalog.plan_version_created', 'plan', planId, {
          version,
          previousVersionId: plan.currentVersionId,
          priceMinor: spec.priceMinor,
          currency: spec.currency,
          billingPeriod: spec.billingPeriod,
          trialDays: spec.trialDays,
        });
      });
      return (await loadPlan(db, planId)) as AdminPlan;
    },

    /** Archive/reactivate a plan, or point it back at an EXISTING version of the same plan. */
    async updatePlan(
      ctx: AdminContext,
      planId: string,
      changes: { status?: PlanStatus; currentVersionId?: string },
    ): Promise<AdminPlan> {
      await db.transaction(async (tx) => {
        const [plan] = await tx
          .select({ id: plans.id })
          .from(plans)
          .where(eq(plans.id, planId))
          .limit(1)
          .for('update');
        if (plan === undefined) throw notFound('Plan not found');
        if (changes.currentVersionId !== undefined) {
          const [version] = await tx
            .select({ id: planVersions.id })
            .from(planVersions)
            .where(
              and(eq(planVersions.id, changes.currentVersionId), eq(planVersions.planId, planId)),
            )
            .limit(1);
          if (version === undefined) throw badRequest('Version does not belong to this plan');
        }
        await tx.update(plans).set(changes).where(eq(plans.id, planId));
        await audit(tx, ctx, 'catalog.plan_updated', 'plan', planId, { ...changes });
      });
      return (await loadPlan(db, planId)) as AdminPlan;
    },
  };
}

export type CatalogAdminRepository = ReturnType<typeof createCatalogAdminRepository>;
