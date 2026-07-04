CREATE INDEX IF NOT EXISTS `media_items_library_id_idx` ON `media_items` (`library_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_created_at_idx` ON `media_items` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_updated_at_idx` ON `media_items` (`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tv_seasons_media_item_id_idx` ON `tv_seasons` (`media_item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tv_episodes_season_id_idx` ON `tv_episodes` (`season_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `movie_files_media_item_id_idx` ON `movie_files` (`media_item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `subtitles_movie_file_id_idx` ON `subtitles` (`movie_file_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `subtitles_episode_id_idx` ON `subtitles` (`episode_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `watch_progress_updated_at_idx` ON `watch_progress` (`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `watch_progress_item_lookup_idx` ON `watch_progress` (`item_type`,`item_id`);
