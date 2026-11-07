-- destructive-approved: only drops users_tenant_id_idx, which is a strict prefix of the two new users indexes created below (the tenant_id foreign key keeps an index); no data is touched.
-- Query-plan indexes (ADR-0018). The new indexes are created first so the foreign key on users.tenant_id always has an index.
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_created_idx` ON `audit_logs` (`action`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `subscriptions_created_idx` ON `subscriptions` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_created_idx` ON `subscriptions` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `tenants_created_idx` ON `tenants` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `tenants_status_created_idx` ON `tenants` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `users_tenant_created_idx` ON `users` (`tenant_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `users_tenant_role_status_idx` ON `users` (`tenant_id`,`tenant_role`,`status`);--> statement-breakpoint
DROP INDEX `users_tenant_id_idx` ON `users`;
