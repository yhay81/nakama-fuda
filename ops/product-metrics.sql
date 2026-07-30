WITH clean_events AS (
  SELECT name, session_id, listing_id, day, created_at
  FROM product_events
  WHERE is_qa = 0
),
listing_depth AS (
  SELECT
    listing_id,
    COUNT(DISTINCT CASE WHEN name = 'listing_opened' THEN session_id END) AS viewers,
    COUNT(DISTINCT CASE WHEN name = 'outbound_opened' THEN session_id END) AS outbound_users
  FROM clean_events
  WHERE listing_id IS NOT NULL
  GROUP BY listing_id
),
listing_continuity AS (
  SELECT
    listing_id,
    MIN(CASE WHEN name = 'listing_created' THEN day END) AS created_day,
    MAX(CASE WHEN name = 'listing_updated' THEN day END) AS updated_day
  FROM clean_events
  WHERE listing_id IS NOT NULL
  GROUP BY listing_id
),
funnel AS (
  SELECT
    COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS visitors,
    COUNT(DISTINCT CASE WHEN name = 'directory_searched' THEN session_id END) AS searchers,
    COUNT(DISTINCT CASE WHEN name = 'listing_created' THEN session_id END) AS creators,
    COUNT(DISTINCT CASE WHEN name = 'listing_opened' THEN session_id END) AS viewers,
    COUNT(DISTINCT CASE WHEN name = 'outbound_opened' THEN session_id END) AS outbound_users,
    COUNT(DISTINCT CASE WHEN name = 'listing_updated' THEN session_id END) AS editors,
    COUNT(DISTINCT CASE WHEN name = 'listing_closed' THEN session_id END) AS closers,
    COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
    COUNT(DISTINCT CASE WHEN name = 'listing_reported' THEN session_id END) AS reporters,
    COUNT(DISTINCT CASE WHEN name = 'listing_deleted' THEN session_id END) AS deleters
  FROM clean_events
)
SELECT
  funnel.*,
  (SELECT COUNT(*) FROM listings WHERE status = 'active' AND expires_on >= date('now')) AS active_listings,
  (SELECT COUNT(*) FROM listings WHERE status = 'closed') AS closed_listings,
  (SELECT COUNT(*) FROM listings WHERE status = 'hidden') AS hidden_listings,
  (SELECT COUNT(*) FROM listing_depth WHERE viewers >= 3) AS listings_with_three_viewers,
  (SELECT COUNT(*) FROM listing_depth WHERE outbound_users >= 2) AS listings_with_two_outbound_users,
  (
    SELECT COUNT(*)
    FROM listing_depth
    WHERE viewers >= 3 AND outbound_users >= 2
  ) AS qualified_listings,
  (
    SELECT COUNT(*)
    FROM listing_continuity
    WHERE created_day IS NOT NULL
      AND updated_day IS NOT NULL
      AND updated_day > created_day
  ) AS listings_updated_later
FROM funnel;
