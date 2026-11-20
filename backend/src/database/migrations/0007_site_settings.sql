CREATE TABLE `site_settings` (
	`id` char(36) NOT NULL,
	`setting_key` varchar(50) NOT NULL,
	`content` json,
	`version` int NOT NULL DEFAULT 1,
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_settings_key_uq` UNIQUE(`setting_key`)
);
