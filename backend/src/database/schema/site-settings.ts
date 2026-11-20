import { int, json, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { id, updatedAt, uuidRef } from './columns.js';

/**
 * Content the platform staff edit from the dashboard (ADR-0027). One row per setting key, today
 * only `home` (the public home page). `content` is validated by the application before it is
 * written; NULL means "use the built-in default". `version` goes up by one on every save and is how
 * two editors avoid silently overwriting each other. No foreign key on `updated_by`: like the audit
 * trail, keeping a record of who saved must never block a save.
 */
export const siteSettings = mysqlTable(
  'site_settings',
  {
    id: id(),
    settingKey: varchar('setting_key', { length: 50 }).notNull(),
    content: json('content').$type<unknown>(),
    version: int('version').notNull().default(1),
    updatedBy: uuidRef('updated_by'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('site_settings_key_uq').on(t.settingKey)],
);
