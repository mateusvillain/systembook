CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`titulo` text NOT NULL,
	`slug` text NOT NULL,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_section_slug_unique` ON `pages` (`section_id`,`slug`);