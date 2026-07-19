CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`tab_id` text NOT NULL,
	`tipo` text NOT NULL,
	`conteudo_json` text NOT NULL,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`tab_id`) REFERENCES `tabs`(`id`) ON UPDATE no action ON DELETE cascade
);
