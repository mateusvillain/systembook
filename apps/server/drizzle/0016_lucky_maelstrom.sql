CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`nome_design_system` text DEFAULT 'Documentation' NOT NULL,
	`logo` blob,
	`logo_mime` text,
	`logo_hash` text,
	`logo_dark` blob,
	`logo_dark_mime` text,
	`logo_dark_hash` text,
	`atualizado_em` integer DEFAULT (unixepoch()) NOT NULL
);
