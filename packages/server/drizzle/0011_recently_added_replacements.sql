ALTER TABLE `media_items` ADD `recently_added_at` integer;
--> statement-breakpoint
ALTER TABLE `movie_files` ADD `file_mtime_ms` integer;
--> statement-breakpoint
ALTER TABLE `tv_episodes` ADD `file_mtime_ms` integer;
--> statement-breakpoint
CREATE INDEX `media_items_recently_added_at_idx` ON `media_items` (coalesce(`recently_added_at`, `created_at` * 1000), `id`);
