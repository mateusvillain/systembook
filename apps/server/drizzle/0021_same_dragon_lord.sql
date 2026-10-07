CREATE TABLE `token_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`commit_sha` text NOT NULL,
	`conteudo_json` text NOT NULL,
	`publicado_em` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `token_sets_latest_idx` ON `token_sets` (`publicado_em`);