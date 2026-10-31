import { and, asc, desc, eq, inArray, lte, type SQL } from 'drizzle-orm';
import { normalizeEmailKey } from '../../common/email.js';
import { badRequest, conflict, notFound, unauthorized } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { TenantScope } from '../../modules/authz/tenant-scope.js';
import {
  addDays,
  canTransition,
  isCancelable,
  isEntitled,
} from '../../modules/subscriptions/subscription-state.js';
import type { Database } from '../client.js';
import { isDuplicateEntry } from '../errors.js';
import type {
  BillingPeriod,
  PlanFeatures,
  PlanLimits,
  SubscriptionStatus,
} from '../schema/index.js';
import {
  auditLogs,
  planVersions,
  plans,
  products,
  subscriptionEvents,
  subscriptions,
  tenants,
  trialClaims,
  users,
} from '../schema/index.js';
import type { AdminContext } from './catalog-admin.repository.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

type Exec = Pick<Database['db'], 'select'>;
type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];
type SubscriptionRow = typeof subscriptions.$inferSelect;

const MAX_ACTIVATION_YEARS = 5;
const EXPIRY_BATCH = 500;

/** The plan version a subscription is entitled to: its pinned one, else the plan's current one. */
export interface SubscriptionVersionView {
  version: number;
  /** True when staff froze this subscription on an older version (ADR-0003 #4). */
  pinned: boolean;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  trialDays: number;
  limits: PlanLimits;
  features: PlanFeatures;
}

/** What a company sees of its own subscription: no internal ids. */
export interface TenantSubscriptionView {
  productCode: string;
  productName: string;
  planCode: string;
  status: SubscriptionStatus;
  /** Whether the company may use the system right now (status AND end date). */
  entitled: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  version: SubscriptionVersionView | null;
}

export interface AdminSubscriptionView {
  id: string;
  tenantId: string;
  tenantName: string;
  productCode: string;
  planCode: string;
  status: SubscriptionStatus;
  entitled: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
}

export interface AdminListQuery {
  status?: SubscriptionStatus;
  limit: number;
  offset: number;
}

interface Change {
  sub: SubscriptionRow;
  productCode: string;
  planCode: string;
  type: string;
  from: SubscriptionStatus | null;
  to: SubscriptionStatus;
  /** null for system work such as the expiry job. */
  actorUserId: string | null;
  requestId?: string;
  /** When set, the change is also written to the audit trail under this action. */
  auditAction?: string;
  extra?: Record<string, unknown>;
}

/** Appends to subscription_events and, for human actions, audit_logs, inside the caller's transaction. */
async function recordChange(tx: Tx, change: Change): Promise<void> {
  await tx.insert(subscriptionEvents).values({
    id: uuidv7(),
    subscriptionId: change.sub.id,
    tenantId: change.sub.tenantId,
    type: change.type,
    fromStatus: change.from,
    toStatus: change.to,
    actorUserId: change.actorUserId,
  });
  if (change.auditAction === undefined) return;
  const metadata = {
    productCode: change.productCode,
    planCode: change.planCode,
    from: change.from,
    to: change.to,
    ...change.extra,
  };
  assertSafeMetadata(metadata);
  await tx.insert(auditLogs).values({
    id: uuidv7(),
    tenantId: change.sub.tenantId,
    actorUserId: change.actorUserId,
    action: change.auditAction,
    targetType: 'subscription',
    targetId: change.sub.id,
    metadata,
    requestId: change.requestId ?? null,
  });
}

const subscriptionColumns = {
  sub: subscriptions,
  productCode: products.code,
  productName: products.name,
  planCode: plans.code,
  planId: plans.id,
  planCurrentVersionId: plans.currentVersionId,
};

function selectRows(exec: Exec, where: SQL | undefined) {
  return exec
    .select(subscriptionColumns)
    .from(subscriptions)
    .innerJoin(products, eq(products.id, subscriptions.productId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)
    .orderBy(asc(products.name), asc(products.code));
}

type JoinedRow = Awaited<ReturnType<typeof selectRows>>[number];

async function toTenantViews(
  exec: Exec,
  rows: JoinedRow[],
  now: Date,
): Promise<TenantSubscriptionView[]> {
  const versionIds = [
    ...new Set(
      rows
        .map((row) => row.sub.pinnedPlanVersionId ?? row.planCurrentVersionId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const versions =
    versionIds.length === 0
      ? []
      : await exec.select().from(planVersions).where(inArray(planVersions.id, versionIds));
  const byId = new Map(versions.map((version) => [version.id, version]));

  return rows.map((row) => {
    const versionId = row.sub.pinnedPlanVersionId ?? row.planCurrentVersionId;
    const version = versionId === null ? undefined : byId.get(versionId);
    // A version that belongs to another plan is never honored (same guard as the public catalog).
    const valid = version !== undefined && version.planId === row.planId ? version : undefined;
    return {
      productCode: row.productCode,
      productName: row.productName,
      planCode: row.planCode,
      status: row.sub.status,
      entitled: isEntitled(row.sub, now),
      trialEndsAt: row.sub.trialEndsAt,
      currentPeriodEnd: row.sub.currentPeriodEnd,
      canceledAt: row.sub.canceledAt,
      version:
        valid === undefined
          ? null
          : {
              version: valid.version,
              pinned: row.sub.pinnedPlanVersionId !== null,
              priceMinor: valid.priceMinor,
              currency: valid.currency,
              billingPeriod: valid.billingPeriod,
              trialDays: valid.trialDays,
              limits: valid.limits,
              features: valid.features,
            },
    };
  });
}

/**
 * The company's subscriptions with what each one entitles it to at `now`. Takes any executor, so
 * another repository can call it inside its own transaction (ADR-0012) and see the same snapshot.
 */
export async function loadTenantSubscriptionViews(
  exec: Exec,
  tenantId: string,
  now: Date,
): Promise<TenantSubscriptionView[]> {
  const rows = await selectRows(exec, eq(subscriptions.tenantId, tenantId));
  return toTenantViews(exec, rows, now);
}

/**
 * Trials, subscriptions and their lifecycle (ADR-0007).
 *
 * Company methods take a TenantScope and add its tenant to every query, so a company can only ever
 * see or change its own subscriptions. Staff methods (`admin*`) are for platform users and work on
 * any company's subscription by id; the routes authorize them. Every state change locks the row,
 * checks the transition rules, and writes the event (and audit record) in the same transaction.
 * `now` is injectable so expiry can be tested without waiting.
 */
export function createSubscriptionsRepository(
  db: Database['db'],
  options: { now?: () => Date } = {},
) {
  const clock = options.now ?? (() => new Date());

  async function lockById(tx: Tx, id: string) {
    const [locked] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(eq(subscriptions.id, id))
      .for('update')
      .limit(1);
    if (locked === undefined) throw notFound();
    const [row] = await selectRows(tx, eq(subscriptions.id, id)).limit(1);
    if (row === undefined) throw notFound();
    return row;
  }

  function adminSelect(exec: Exec) {
    return exec
      .select({ ...subscriptionColumns, tenantName: tenants.name })
      .from(subscriptions)
      .innerJoin(products, eq(products.id, subscriptions.productId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId));
  }

  function toAdminView(
    row: { sub: SubscriptionRow; productCode: string; planCode: string; tenantName: string },
    now: Date,
  ): AdminSubscriptionView {
    return {
      id: row.sub.id,
      tenantId: row.sub.tenantId,
      tenantName: row.tenantName,
      productCode: row.productCode,
      planCode: row.planCode,
      status: row.sub.status,
      entitled: isEntitled(row.sub, now),
      trialEndsAt: row.sub.trialEndsAt,
      currentPeriodEnd: row.sub.currentPeriodEnd,
      canceledAt: row.sub.canceledAt,
      createdAt: row.sub.createdAt,
    };
  }

  async function adminView(exec: Exec, id: string, now: Date): Promise<AdminSubscriptionView> {
    const [row] = await adminSelect(exec).where(eq(subscriptions.id, id)).limit(1);
    if (row === undefined) throw notFound();
    return toAdminView(row, now);
  }

  return {
    /** The company's own subscriptions with what each one currently entitles it to. */
    async listForTenant(scope: TenantScope): Promise<TenantSubscriptionView[]> {
      const rows = await selectRows(db, eq(subscriptions.tenantId, scope.tenantId));
      return toTenantViews(db, rows, clock());
    },

    /**
     * Starts the free trial of a plan for the caller's company. The trial length comes from the
     * plan's CURRENT version in the database, never from the request. One trial per company and
     * per normalized email for each product (ADR-0003 #3), forever: canceling does not give it back.
     * Every "no" on that rule answers the same 409 so it does not reveal which check failed.
     */
    async startTrial(
      scope: TenantScope,
      input: { productCode: string; planCode: string },
      requestId?: string,
    ): Promise<TenantSubscriptionView> {
      const now = clock();
      return db.transaction(async (tx) => {
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.code, input.productCode), eq(products.status, 'available')))
          .limit(1);
        if (product === undefined) throw notFound();

        const [plan] = await tx
          .select({
            id: plans.id,
            versionId: planVersions.id,
            trialDays: planVersions.trialDays,
          })
          .from(plans)
          .innerJoin(
            planVersions,
            and(eq(planVersions.id, plans.currentVersionId), eq(planVersions.planId, plans.id)),
          )
          .where(
            and(
              eq(plans.productId, product.id),
              eq(plans.code, input.planCode),
              eq(plans.status, 'active'),
            ),
          )
          .limit(1);
        if (plan === undefined) throw notFound();
        if (plan.trialDays <= 0) throw badRequest('This plan has no free trial');

        const [actor] = await tx
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.id, scope.actorUserId), eq(users.tenantId, scope.tenantId)))
          .limit(1);
        if (actor === undefined) throw unauthorized();

        const trialEndsAt = addDays(now, plan.trialDays);
        const subscriptionId = uuidv7();
        try {
          await tx.insert(trialClaims).values({
            id: uuidv7(),
            productId: product.id,
            tenantId: scope.tenantId,
            emailKey: normalizeEmailKey(actor.email),
          });
          await tx.insert(subscriptions).values({
            id: subscriptionId,
            tenantId: scope.tenantId,
            productId: product.id,
            planId: plan.id,
            status: 'trialing',
            trialEndsAt,
            currentPeriodEnd: trialEndsAt,
          });
        } catch (error) {
          if (isDuplicateEntry(error)) {
            throw conflict('A free trial is not available for this system');
          }
          throw error;
        }

        const [row] = await selectRows(
          tx,
          and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, scope.tenantId)),
        ).limit(1);
        if (row === undefined) throw notFound();
        await recordChange(tx, {
          sub: row.sub,
          productCode: row.productCode,
          planCode: row.planCode,
          type: 'subscription.trial_started',
          from: null,
          to: 'trialing',
          actorUserId: scope.actorUserId,
          ...(requestId !== undefined && { requestId }),
          auditAction: 'subscription.trial_started',
          extra: { trialDays: plan.trialDays },
        });
        const [view] = await toTenantViews(tx, [row], now);
        if (view === undefined) throw notFound();
        return view;
      });
    },

    /** Cancels the company's own subscription to a product. Access ends immediately. */
    async cancelForTenant(
      scope: TenantScope,
      productCode: string,
      requestId?: string,
    ): Promise<TenantSubscriptionView> {
      const now = clock();
      return db.transaction(async (tx) => {
        // Resolve the product first, then lock ONLY the subscription row: a locking read on the
        // join would also lock the shared product row and serialize unrelated companies.
        const [product] = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.code, productCode))
          .limit(1);
        if (product === undefined) throw notFound();
        const [found] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.tenantId, scope.tenantId),
              eq(subscriptions.productId, product.id),
            ),
          )
          .for('update')
          .limit(1);
        if (found === undefined) throw notFound();

        const [row] = await selectRows(
          tx,
          and(eq(subscriptions.id, found.id), eq(subscriptions.tenantId, scope.tenantId)),
        ).limit(1);
        if (row === undefined) throw notFound();
        if (!isCancelable(row.sub.status)) throw conflict('This subscription is already over');

        await tx
          .update(subscriptions)
          .set({ status: 'canceled', canceledAt: now })
          .where(and(eq(subscriptions.id, row.sub.id), eq(subscriptions.tenantId, scope.tenantId)));
        await recordChange(tx, {
          sub: row.sub,
          productCode: row.productCode,
          planCode: row.planCode,
          type: 'subscription.canceled',
          from: row.sub.status,
          to: 'canceled',
          actorUserId: scope.actorUserId,
          ...(requestId !== undefined && { requestId }),
          auditAction: 'subscription.canceled',
        });
        const [updated] = await selectRows(
          tx,
          and(eq(subscriptions.id, row.sub.id), eq(subscriptions.tenantId, scope.tenantId)),
        ).limit(1);
        if (updated === undefined) throw notFound();
        const [view] = await toTenantViews(tx, [updated], now);
        if (view === undefined) throw notFound();
        return view;
      });
    },

    /**
     * Marks every trialing/active subscription whose end date has passed as expired, in batches,
     * and records one event per subscription. Safe to run from several instances at once (rows
     * another run holds are skipped) and safe to repeat. Returns how many were expired.
     */
    async expireDue(at: Date = clock()): Promise<number> {
      let total = 0;
      for (;;) {
        const count = await db.transaction(async (tx) => {
          const due = await tx
            .select({
              id: subscriptions.id,
              tenantId: subscriptions.tenantId,
              status: subscriptions.status,
            })
            .from(subscriptions)
            .where(
              and(
                inArray(subscriptions.status, ['trialing', 'active']),
                lte(subscriptions.currentPeriodEnd, at),
              ),
            )
            .orderBy(asc(subscriptions.currentPeriodEnd), asc(subscriptions.id))
            .limit(EXPIRY_BATCH)
            .for('update', { skipLocked: true });
          if (due.length === 0) return 0;

          await tx
            .update(subscriptions)
            .set({ status: 'expired' })
            .where(
              inArray(
                subscriptions.id,
                due.map((row) => row.id),
              ),
            );
          await tx.insert(subscriptionEvents).values(
            due.map((row) => ({
              id: uuidv7(),
              subscriptionId: row.id,
              tenantId: row.tenantId,
              type: 'subscription.expired',
              fromStatus: row.status,
              toStatus: 'expired' as const,
              actorUserId: null,
            })),
          );
          // The automatic end is part of the audit trail too (actor null = the system), so a
          // company's history shows why its access stopped. Codes are read after the rows are
          // locked and without locking products or plans.
          const dueIds = due.map((row) => row.id);
          const named = await tx
            .select({ id: subscriptions.id, productCode: products.code, planCode: plans.code })
            .from(subscriptions)
            .innerJoin(products, eq(products.id, subscriptions.productId))
            .innerJoin(plans, eq(plans.id, subscriptions.planId))
            .where(inArray(subscriptions.id, dueIds));
          const namesById = new Map(named.map((row) => [row.id, row]));
          await tx.insert(auditLogs).values(
            due.map((row) => {
              const names = namesById.get(row.id);
              const metadata = {
                productCode: names?.productCode ?? null,
                planCode: names?.planCode ?? null,
                from: row.status,
                to: 'expired',
              };
              assertSafeMetadata(metadata);
              return {
                id: uuidv7(),
                tenantId: row.tenantId,
                actorUserId: null,
                action: 'subscription.expired',
                targetType: 'subscription',
                targetId: row.id,
                metadata,
                requestId: null,
              };
            }),
          );
          return due.length;
        });
        total += count;
        if (count < EXPIRY_BATCH) return total;
      }
    },

    // ---- Platform staff -------------------------------------------------------------------

    async adminList(query: AdminListQuery) {
      const now = clock();
      const rows = await adminSelect(db)
        .where(query.status === undefined ? undefined : eq(subscriptions.status, query.status))
        .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
        .limit(query.limit)
        .offset(query.offset);
      return rows.map((row) => toAdminView(row, now));
    },

    /** Manual activation until payments exist: sets the end of the paid period (also renews). */
    async adminActivate(ctx: AdminContext, id: string, periodEnd: Date): Promise<AdminSubscriptionView> {
      const now = clock();
      if (periodEnd.getTime() <= now.getTime()) {
        throw badRequest('The end of the period must be in the future');
      }
      if (periodEnd.getTime() > addDays(now, 365 * MAX_ACTIVATION_YEARS).getTime()) {
        throw badRequest(`The end of the period cannot be more than ${MAX_ACTIVATION_YEARS} years away`);
      }
      return db.transaction(async (tx) => {
        const row = await lockById(tx, id);
        if (!canTransition(row.sub.status, 'active')) throw conflict('Cannot activate this subscription');
        await tx
          .update(subscriptions)
          .set({ status: 'active', currentPeriodEnd: periodEnd, canceledAt: null })
          .where(eq(subscriptions.id, id));
        await recordChange(tx, {
          sub: row.sub,
          productCode: row.productCode,
          planCode: row.planCode,
          type: row.sub.status === 'active' ? 'subscription.renewed' : 'subscription.activated',
          from: row.sub.status,
          to: 'active',
          actorUserId: ctx.actorUserId,
          ...(ctx.requestId !== undefined && { requestId: ctx.requestId }),
          auditAction: 'subscription.activated',
          extra: { periodEnd: periodEnd.toISOString() },
        });
        return adminView(tx, id, now);
      });
    },

    async adminCancel(ctx: AdminContext, id: string): Promise<AdminSubscriptionView> {
      const now = clock();
      return db.transaction(async (tx) => {
        const row = await lockById(tx, id);
        if (!isCancelable(row.sub.status)) throw conflict('This subscription is already over');
        await tx
          .update(subscriptions)
          .set({ status: 'canceled', canceledAt: now })
          .where(eq(subscriptions.id, id));
        await recordChange(tx, {
          sub: row.sub,
          productCode: row.productCode,
          planCode: row.planCode,
          type: 'subscription.canceled',
          from: row.sub.status,
          to: 'canceled',
          actorUserId: ctx.actorUserId,
          ...(ctx.requestId !== undefined && { requestId: ctx.requestId }),
          auditAction: 'subscription.canceled',
        });
        return adminView(tx, id, now);
      });
    },

    /** Adds days to a running trial. Counted from the current end, or from now if that has passed. */
    async adminExtendTrial(ctx: AdminContext, id: string, days: number): Promise<AdminSubscriptionView> {
      const now = clock();
      return db.transaction(async (tx) => {
        const row = await lockById(tx, id);
        if (row.sub.status !== 'trialing') throw conflict('Only a running trial can be extended');
        const base =
          row.sub.trialEndsAt !== null && row.sub.trialEndsAt.getTime() > now.getTime()
            ? row.sub.trialEndsAt
            : now;
        const trialEndsAt = addDays(base, days);
        await tx
          .update(subscriptions)
          .set({ trialEndsAt, currentPeriodEnd: trialEndsAt })
          .where(eq(subscriptions.id, id));
        await recordChange(tx, {
          sub: row.sub,
          productCode: row.productCode,
          planCode: row.planCode,
          type: 'subscription.trial_extended',
          from: 'trialing',
          to: 'trialing',
          actorUserId: ctx.actorUserId,
          ...(ctx.requestId !== undefined && { requestId: ctx.requestId }),
          auditAction: 'subscription.trial_extended',
          extra: { days, trialEndsAt: trialEndsAt.toISOString() },
        });
        return adminView(tx, id, now);
      });
    },
  };
}

export type SubscriptionsRepository = ReturnType<typeof createSubscriptionsRepository>;
