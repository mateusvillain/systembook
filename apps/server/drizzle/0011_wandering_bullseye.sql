CREATE TABLE `menus` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`slug` text,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menus_slug_unique` ON `menus` (`slug`);--> statement-breakpoint
INSERT INTO `menus` (`id`, `titulo`, `slug`, `ordem`) VALUES ('__sb_default_menu__', 'Documentação', 'documentacao', 0);--> statement-breakpoint
ALTER TABLE `sections` ADD `menu_id` text DEFAULT '__sb_default_menu__' NOT NULL;