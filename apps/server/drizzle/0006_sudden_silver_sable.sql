CREATE TABLE `component_previews` (
	`id` text PRIMARY KEY NOT NULL,
	`component_name` text NOT NULL,
	`variant_id` text NOT NULL,
	`commit_sha` text NOT NULL,
	`path_estatico` text NOT NULL,
	`publicado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `component_previews_latest_idx` ON `component_previews` (`component_name`,`variant_id`,`publicado_em`);