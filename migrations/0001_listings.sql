PRAGMA foreign_keys = ON;

CREATE TABLE listings (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) = 12),
  capability_hash TEXT NOT NULL CHECK(length(capability_hash) = 64),
  game_name TEXT NOT NULL CHECK(length(game_name) BETWEEN 1 AND 60),
  group_name TEXT NOT NULL CHECK(length(group_name) BETWEEN 1 AND 60),
  headline TEXT NOT NULL CHECK(length(headline) BETWEEN 1 AND 80),
  description TEXT NOT NULL CHECK(length(description) <= 500),
  platform TEXT NOT NULL CHECK(platform IN ('crossplay', 'mobile', 'other', 'pc', 'playstation', 'switch', 'xbox')),
  server_name TEXT NOT NULL CHECK(length(server_name) <= 40),
  activity_time TEXT NOT NULL CHECK(activity_time IN ('day', 'evening', 'flexible', 'late', 'morning')),
  frequency TEXT NOT NULL CHECK(frequency IN ('casual', 'frequent', 'weekly')),
  group_size INTEGER NOT NULL CHECK(group_size BETWEEN 1 AND 999),
  open_seats INTEGER NOT NULL CHECK(open_seats BETWEEN 1 AND 100),
  vc TEXT NOT NULL CHECK(vc IN ('none', 'optional', 'required')),
  beginners INTEGER NOT NULL CHECK(beginners IN (0, 1)),
  trial INTEGER NOT NULL CHECK(trial IN (0, 1)),
  styles TEXT NOT NULL CHECK(length(styles) <= 160),
  application_url TEXT NOT NULL CHECK(length(application_url) <= 500),
  expires_on TEXT NOT NULL CHECK(length(expires_on) = 10),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'closed', 'hidden')),
  report_count INTEGER NOT NULL DEFAULT 0 CHECK(report_count >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX listings_public_idx ON listings(status, expires_on, updated_at DESC);
CREATE INDEX listings_game_idx ON listings(game_name, status, expires_on);
CREATE INDEX listings_filters_idx ON listings(platform, activity_time, vc, beginners, status);

CREATE TABLE listing_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  reporter_hash TEXT NOT NULL CHECK(length(reporter_hash) = 64),
  reason TEXT NOT NULL CHECK(reason IN ('harmful', 'impersonation', 'other', 'spam')),
  created_at INTEGER NOT NULL,
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK(is_qa IN (0, 1)),
  UNIQUE(listing_id, session_id),
  UNIQUE(listing_id, reporter_hash)
);

CREATE TABLE product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(name IN (
    'visited',
    'directory_searched',
    'listing_created',
    'listing_opened',
    'outbound_opened',
    'listing_updated',
    'listing_closed',
    'listing_deleted',
    'listing_reported',
    'returned'
  )),
  session_id TEXT NOT NULL CHECK(length(session_id) = 36),
  listing_id TEXT CHECK(listing_id IS NULL OR length(listing_id) = 36),
  day TEXT NOT NULL CHECK(length(day) = 10),
  created_at INTEGER NOT NULL,
  is_qa INTEGER NOT NULL DEFAULT 0 CHECK(is_qa IN (0, 1))
);

CREATE INDEX product_events_created_idx ON product_events(created_at);
CREATE INDEX product_events_name_day_idx ON product_events(name, day);
CREATE INDEX product_events_listing_idx ON product_events(listing_id, name);
