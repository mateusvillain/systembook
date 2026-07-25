CREATE TABLE `status_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`cor` text NOT NULL,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `pages` ADD `status_tag_id` text REFERENCES status_tags(id) ON DELETE SET NULL;