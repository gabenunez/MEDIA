CREATE INDEX IF NOT EXISTS `media_items_library_updated_idx` ON `media_items` (`library_id`, `updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_library_type_title_idx` ON `media_items` (`library_id`, `type`, `title`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_library_type_rating_idx` ON `media_items` (`library_id`, `type`, `rating`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_tmdb_id_idx` ON `media_items` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `tv_episodes_season_episode_idx` ON `tv_episodes` (`season_id`, `episode_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `favorites_created_at_idx` ON `favorites` (`created_at`);
