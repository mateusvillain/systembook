CREATE TABLE `menus` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`slug` text,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menus_slug_unique` ON `menus` (`slug`);--> statement-breakpoint
ALTER TABLE `sections` ADD `menu_id` text DEFAULT '__sb_default_menu__' NOT NULL REFERENCES menus(id);