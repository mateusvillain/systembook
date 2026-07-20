ALTER TABLE `sections` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sections_slug_unique` ON `sections` (`slug`);