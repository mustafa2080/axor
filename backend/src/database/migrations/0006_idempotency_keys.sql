CREATE TABLE `idempotency_keys` (
	`id` char(36) NOT NULL,
	`actor_user_id` char(36) NOT NULL,
	`idem_key` varchar(64) NOT NULL,
	`request_hash` char(64) NOT NULL,
	`state` varchar(16) NOT NULL,
	`response_status` smallint,
	`response_body` json,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `idempotency_keys_actor_key_uq` UNIQUE(`actor_user_id`,`idem_key`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_expires_at_idx` ON `idempotency_keys` (`expires_at`);