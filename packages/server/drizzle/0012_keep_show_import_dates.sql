UPDATE `media_items`
SET `recently_added_at` = NULL
WHERE `type` = 'tv' AND `recently_added_at` IS NOT NULL;
