CREATE TABLE `tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`titulo` text NOT NULL,
	`ordem` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade
);
