CREATE TABLE `upload_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL,
	`revogado_em` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upload_tokens_token_hash_unique` ON `upload_tokens` (`token_hash`);