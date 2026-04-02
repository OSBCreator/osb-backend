-- ═══════════════════════════════════════════════════════════════
-- OSB e-Consultancy — Complete Supabase Schema
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ═══════════════════════════════════════════════════════════════

-- ── 1. SCORE SUBMISSIONS ─────────────────────────────────────
-- Drop and recreate to fix the missing columns error
DROP TABLE IF EXISTS score_submissions;

CREATE TABLE score_submissions (
  id          BIGSERIAL PRIMARY KEY,
  user        TEXT,
  email       TEXT,
  country     TEXT,
  platform    TEXT,
  score       TEXT,
  risk        TEXT,
  result      TEXT,
  money       TEXT,
  story       TEXT,
  timestamp   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. COMMUNITY POSTS ───────────────────────────────────────
DROP TABLE IF EXISTS community_posts;

CREATE TABLE community_posts (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL,
  content     TEXT NOT NULL,
  pillar      TEXT,          -- R / S / E / I / null
  ifn_ref     TEXT,          -- IFN-001 etc
  approved    BOOLEAN DEFAULT FALSE,
  likes       INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. NEWSLETTER SUBSCRIBERS ────────────────────────────────
DROP TABLE IF EXISTS newsletter_subscribers;

CREATE TABLE newsletter_subscribers (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  subscribed_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. CONTACT MESSAGES ──────────────────────────────────────
DROP TABLE IF EXISTS contact_messages;

CREATE TABLE contact_messages (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT,
  reason      TEXT,
  message     TEXT NOT NULL,
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Public can INSERT submissions and posts (via server with service role key)
-- Public can SELECT approved community posts only
-- All admin reads go through server with service role key (bypasses RLS)

ALTER TABLE score_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Allow public read of approved community posts
CREATE POLICY "Public read approved posts"
  ON community_posts FOR SELECT
  USING (approved = TRUE);

-- Service role bypasses all RLS automatically (your server uses service role key)

-- ── SEED SOME COMMUNITY POSTS ─────────────────────────────────
-- These are approved starter posts based on real IFN data
INSERT INTO community_posts (username, content, pillar, ifn_ref, approved, likes) VALUES
  ('OSB_Analyst', 'IFN-005 just dropped — The Facade Bank Page. A fake bank interface showing a large balance before any money request is made. The architecture of safety was built before the ask arrived. First documented by OSB globally.', 'S', 'IFN-005', TRUE, 6),
  ('OSB_Analyst', 'IFN-001: The victim called the real bank themselves. Got real automated confirmation of a large balance. Still a trap. The standard advice — verify independently — was defeated. OSB documented this first globally.', 'S', 'IFN-001', TRUE, 8),
  ('OSB_Analyst', 'E Score 5 with zero financial loss — IFN-002. This case formally established the E Pillar Independent Trigger. Emotional harm is real harm. You do not need to lose money for a scam to have hurt you.', 'E', 'IFN-002', TRUE, 12),
  ('OSB_Analyst', '$28,000 over 3 years — IFN-004. Small asks. Low velocity. The most dangerous I-Pillar pattern. Each amount small enough to justify. The total catastrophic.', 'I', 'IFN-004', TRUE, 19);
