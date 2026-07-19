CREATE TABLE `revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`autor_id` text,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL,
	`mensagem` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
