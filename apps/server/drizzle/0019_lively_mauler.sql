CREATE TABLE `media` (
	`hash` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`criado_em` integer DEFAULT (unixepoch()) NOT NULL
);
