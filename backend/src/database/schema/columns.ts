import { sql } from 'drizzle-orm';
import { char, datetime } from 'drizzle-orm/mysql-core';

// Shared column builders (ADR-0003 §2): UUIDv7 ids in char(36), UTC datetime(3).

/** Primary key. The value is generated in the application with `uuidv7()`. */
export const id = () => char('id', { length: 36 }).primaryKey();

/** Foreign-key / reference column holding a UUID. */
export const uuidRef = (name: string) => char(name, { length: 36 });

export const dateTime = (name: string) => datetime(name, { mode: 'date', fsp: 3 });

export const createdAt = () =>
  dateTime('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`);

export const updatedAt = () =>
  dateTime('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());
