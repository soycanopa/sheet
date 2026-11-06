ALTER TABLE `user_preferences` ADD `chat_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `chat_provider` text DEFAULT 'opencode' NOT NULL;