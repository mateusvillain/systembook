PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`slug` text,
	`menu_id` text DEFAULT '__sb_default_menu__' NOT NULL,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sections`("id", "titulo", "slug", "menu_id", "ordem") SELECT "id", "titulo", "slug", "menu_id", "ordem" FROM `sections`;--> statement-breakpoint
DROP TABLE `sections`;--> statement-breakpoint
ALTER TABLE `__new_sections` RENAME TO `sections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `sections_slug_unique` ON `sections` (`slug`);