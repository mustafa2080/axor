import { eq } from 'drizzle-orm';
import { AppError } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../client.js';
import { isDeadlock, isDuplicateEntry } from '../errors.js';
import { auditLogs, siteSettings } from '../schema/index.js';
import type { AdminContext } from './catalog-admin.repository.js';
import { assertSafeMetadata } from './tenant-audit-logs.repository.js';

/** What a reader gets: the stored content (null = built-in default), its version, and when it was saved. */
export interface SiteSettingView {
  content: unknown;
  /** 0 when nothing was ever saved. */
  version: number;
  updatedAt: Date | null;
}

const contentChanged = () =>
  new AppError(
    409,
    'CONTENT_CHANGED',
    'The content was changed by someone else after you opened it. Reload it and try again',
  );

/**
 * The audit action for a save. The home page keeps its original names (ADR-0027); every information
 * page (ADR-0028) uses one pair of names, and the page is in the event's `setting` and `targetId`.
 */
function auditAction(key: string, reset: boolean): string {
  if (key === 'home') return reset ? 'site.home_reset' : 'site.home_updated';
  return reset ? 'site.page_reset' : 'site.page_updated';
}

/**
 * Site settings the platform staff edit from the dashboard (ADR-0027). The repository does not
 * know the shape of the content: the route validates it before it gets here, so what is stored is
 * always valid. A save is one transaction: the row is locked, the version the editor started from
 * must still be the current one, the content is replaced and the audit event is written. Two
 * editors can therefore never overwrite each other silently.
 */
export function createSiteSettingsRepository(db: Database['db']) {
  async function read(exec: Pick<Database['db'], 'select'>, key: string): Promise<SiteSettingView> {
    const [row] = await exec
      .select({
        content: siteSettings.content,
        version: siteSettings.version,
        updatedAt: siteSettings.updatedAt,
      })
      .from(siteSettings)
      .where(eq(siteSettings.settingKey, key))
      .limit(1);
    return row ?? { content: null, version: 0, updatedAt: null };
  }

  return {
    get(key: string): Promise<SiteSettingView> {
      return read(db, key);
    },

    /** Replaces the content (or resets it to the built-in default with `null`). */
    async save(
      ctx: AdminContext,
      key: string,
      expectedVersion: number,
      content: unknown,
    ): Promise<SiteSettingView> {
      try {
        return await db.transaction(async (tx) => {
          const [row] = await tx
            .select({ id: siteSettings.id, version: siteSettings.version })
            .from(siteSettings)
            .where(eq(siteSettings.settingKey, key))
            .limit(1)
            .for('update');
          const current = row?.version ?? 0;
          if (current !== expectedVersion) throw contentChanged();
          const next = current + 1;
          if (row === undefined) {
            await tx
              .insert(siteSettings)
              .values({ id: uuidv7(), settingKey: key, content, version: next, updatedBy: ctx.actorUserId });
          } else {
            await tx
              .update(siteSettings)
              .set({ content, version: next, updatedBy: ctx.actorUserId })
              .where(eq(siteSettings.id, row.id));
          }
          // The content itself is not copied into the audit trail: who saved, when, and which
          // version is enough, and the page is public anyway.
          const metadata = { setting: key, fromVersion: current, toVersion: next };
          assertSafeMetadata(metadata);
          await tx.insert(auditLogs).values({
            id: uuidv7(),
            actorUserId: ctx.actorUserId,
            tenantId: null,
            action: auditAction(key, content === null),
            targetType: 'site_setting',
            targetId: key,
            metadata,
            requestId: ctx.requestId ?? null,
          });
          return read(tx, key);
        });
      } catch (error) {
        // Two first saves at once: both saw no row, so either the second insert hit the unique key
        // or the database broke the lock cycle and rolled one back. Either way the other save won.
        if (isDuplicateEntry(error) || isDeadlock(error)) throw contentChanged();
        throw error;
      }
    },
  };
}

export type SiteSettingsRepository = ReturnType<typeof createSiteSettingsRepository>;
