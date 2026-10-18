import { mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { createdAt, id, updatedAt } from './columns.js';
import type { ProductStatus } from './enums.js';

export const products = mysqlTable(
  'products',
  {
    id: id(),
    /** Stable machine code, e.g. 'stark' or 'caprina'. */
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    /** Lives in the database so a product can be enabled later without a redeploy. */
    status: varchar('status', { length: 20 }).$type<ProductStatus>().notNull().default('coming_soon'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('products_code_uq').on(t.code)],
);
