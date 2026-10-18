CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`actor_user_id` char(36),
	`tenant_id` char(36),
	`action` varchar(100) NOT NULL,
	`target_type` varchar(50),
	`target_id` varchar(64),
	`metadata` json,
	`request_id` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_activities` (
	`id` char(36) NOT NULL,
	`product_id` char(36) NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `business_activities_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_activities_product_code_uq` UNIQUE(`product_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `plan_versions` (
	`id` char(36) NOT NULL,
	`plan_id` char(36) NOT NULL,
	`version` int NOT NULL,
	`price_minor` bigint unsigned NOT NULL,
	`currency` char(3) NOT NULL,
	`billing_period` varchar(20) NOT NULL,
	`trial_days` int unsigned NOT NULL DEFAULT 0,
	`limits` json NOT NULL,
	`features` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `plan_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_versions_plan_version_uq` UNIQUE(`plan_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` char(36) NOT NULL,
	`product_id` char(36) NOT NULL,
	`activity_id` char(36),
	`code` varchar(50) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`current_version_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_product_code_uq` UNIQUE(`product_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` char(36) NOT NULL,
	`code` varchar(50) NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'coming_soon',
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `refresh_sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`family_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`replaced_by_id` char(36),
	`user_agent` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `refresh_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `refresh_sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `subscription_events` (
	`id` char(36) NOT NULL,
	`subscription_id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`type` varchar(50) NOT NULL,
	`from_status` varchar(20),
	`to_status` varchar(20),
	`actor_user_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `subscription_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`product_id` char(36) NOT NULL,
	`plan_id` char(36) NOT NULL,
	`pinned_plan_version_id` char(36),
	`status` varchar(20) NOT NULL DEFAULT 'trialing',
	`trial_ends_at` datetime(3),
	`current_period_end` datetime(3),
	`canceled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_tenant_product_uq` UNIQUE(`tenant_id`,`product_id`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` char(36) NOT NULL,
	`name` varchar(200) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`closed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trial_claims` (
	`id` char(36) NOT NULL,
	`product_id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`email_key` varchar(320) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `trial_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `trial_claims_product_email_uq` UNIQUE(`product_id`,`email_key`),
	CONSTRAINT `trial_claims_product_tenant_uq` UNIQUE(`product_id`,`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`password_hash` varchar(255),
	`status` varchar(20) NOT NULL DEFAULT 'active',
	`tenant_id` char(36),
	`tenant_role` varchar(20),
	`platform_role` varchar(20),
	`email_verified_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_uq` UNIQUE(`email`),
	CONSTRAINT `users_scope_chk` CHECK((`users`.`tenant_id` IS NOT NULL AND `users`.`tenant_role` IS NOT NULL AND `users`.`platform_role` IS NULL)
        OR (`users`.`tenant_id` IS NULL AND `users`.`tenant_role` IS NULL AND `users`.`platform_role` IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE `business_activities` ADD CONSTRAINT `business_activities_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plan_versions` ADD CONSTRAINT `plan_versions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plans` ADD CONSTRAINT `plans_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plans` ADD CONSTRAINT `plans_activity_id_business_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `business_activities`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_sessions` ADD CONSTRAINT `refresh_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_events` ADD CONSTRAINT `subscription_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_pinned_plan_version_id_plan_versions_id_fk` FOREIGN KEY (`pinned_plan_version_id`) REFERENCES `plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trial_claims` ADD CONSTRAINT `trial_claims_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trial_claims` ADD CONSTRAINT `trial_claims_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_tenant_id_tenants_id_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_logs_tenant_created_idx` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_created_idx` ON `audit_logs` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `refresh_sessions_user_id_idx` ON `refresh_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_sessions_family_id_idx` ON `refresh_sessions` (`family_id`);--> statement-breakpoint
CREATE INDEX `subscription_events_sub_created_idx` ON `subscription_events` (`subscription_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_period_idx` ON `subscriptions` (`status`,`current_period_end`);--> statement-breakpoint
CREATE INDEX `users_tenant_id_idx` ON `users` (`tenant_id`);