CREATE TABLE `chat_session` (
	`id` text PRIMARY KEY NOT NULL,
	`design_id` text NOT NULL,
	`model` text,
	`effort` text DEFAULT 'auto' NOT NULL,
	`preview` text DEFAULT '' NOT NULL,
	`transcript` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_session_design_id_idx` ON `chat_session` (`design_id`,`updated_at`);