UPDATE `tv_episodes`
SET `season_id` = (
  SELECT MIN(`keep`.`id`)
  FROM `tv_seasons` AS `current`
  JOIN `tv_seasons` AS `keep`
    ON `keep`.`media_item_id` = `current`.`media_item_id`
   AND `keep`.`season_number` = `current`.`season_number`
  WHERE `current`.`id` = `tv_episodes`.`season_id`
);--> statement-breakpoint
UPDATE `tv_seasons`
SET
  `name` = COALESCE(`name`, (
    SELECT `other`.`name`
    FROM `tv_seasons` AS `other`
    WHERE `other`.`media_item_id` = `tv_seasons`.`media_item_id`
      AND `other`.`season_number` = `tv_seasons`.`season_number`
      AND `other`.`name` IS NOT NULL
    ORDER BY `other`.`id`
    LIMIT 1
  )),
  `overview` = COALESCE(`overview`, (
    SELECT `other`.`overview`
    FROM `tv_seasons` AS `other`
    WHERE `other`.`media_item_id` = `tv_seasons`.`media_item_id`
      AND `other`.`season_number` = `tv_seasons`.`season_number`
      AND `other`.`overview` IS NOT NULL
    ORDER BY `other`.`id`
    LIMIT 1
  )),
  `poster_path` = COALESCE(`poster_path`, (
    SELECT `other`.`poster_path`
    FROM `tv_seasons` AS `other`
    WHERE `other`.`media_item_id` = `tv_seasons`.`media_item_id`
      AND `other`.`season_number` = `tv_seasons`.`season_number`
      AND `other`.`poster_path` IS NOT NULL
    ORDER BY `other`.`id`
    LIMIT 1
  )),
  `air_date` = COALESCE(`air_date`, (
    SELECT `other`.`air_date`
    FROM `tv_seasons` AS `other`
    WHERE `other`.`media_item_id` = `tv_seasons`.`media_item_id`
      AND `other`.`season_number` = `tv_seasons`.`season_number`
      AND `other`.`air_date` IS NOT NULL
    ORDER BY `other`.`id`
    LIMIT 1
  ))
WHERE `id` IN (
  SELECT `id` FROM (
    SELECT MIN(`id`) AS `id`
    FROM `tv_seasons`
    GROUP BY `media_item_id`, `season_number`
    HAVING COUNT(*) > 1
  )
);--> statement-breakpoint
DELETE FROM `tv_seasons`
WHERE `id` NOT IN (
  SELECT `id` FROM (
    SELECT MIN(`id`) AS `id`
    FROM `tv_seasons`
    GROUP BY `media_item_id`, `season_number`
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tv_seasons_media_item_season_unique` ON `tv_seasons` (`media_item_id`, `season_number`);
