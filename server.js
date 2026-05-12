require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── ROOT ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── SCORE SUBMISSION ──────────────────────────────────
// Accepts both old format (user/score/risk) and new format (result/email/country/platform/money/story)
app.post("/api/score", async (req, res) => {
  console.log("===== NEW SCORE SUBMISSION =====");
  console.log(req.body);

  const {
    user,
    email,
    country,
    platform,
    score,
    risk,
    result,
    money,
    story,
    timestamp
  } = req.body;

  const record = {
    user: user || null,
    email: email || null,
    country: country || null,
    platform: platform || null,
    score: score || null,
    risk: risk || null,
    result: result || null,
    money: money || null,
    story: story || null,
    timestamp: timestamp || new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("score_submissions")
    .insert([record]);

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  console.log("Saved to Supabase ✅");
  res.json({ ok: true });
});

// ── GET ALL SUBMISSIONS (admin) ───────────────────────
app.get("/api/submissions", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("score_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
});

// ── COMMUNITY: GET POSTS ──────────────────────────────
app.get("/api/community", async (req, res) => {
  const { pillar, limit } = req.query;

  let query = supabase
    .from("community_posts")
    .select("*")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(parseInt(limit) || 50);

  if (pillar && pillar !== "all") {
    query = query.eq("pillar", pillar.toUpperCase());
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
});

// ── COMMUNITY: NEW POST ───────────────────────────────
app.post("/api/community", async (req, res) => {
  const { username, content, pillar, ifn_ref } = req.body;

  if (!username || !content) {
    return res.status(400).json({ ok: false, error: "Username and content required" });
  }

  const { data, error } = await supabase
    .from("community_posts")
    .insert([{
      username,
      content,
      pillar: pillar || null,
      ifn_ref: ifn_ref || null,
      approved: false, // goes to moderation queue first
      likes: 0
    }]);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, message: "Post submitted for review" });
});

// ── COMMUNITY: LIKE A POST ────────────────────────────
app.post("/api/community/:id/like", async (req, res) => {
  const { id } = req.params;

  const { data: post } = await supabase
    .from("community_posts")
    .select("likes")
    .eq("id", id)
    .single();

  if (!post) return res.status(404).json({ ok: false, error: "Not found" });

  const { error } = await supabase
    .from("community_posts")
    .update({ likes: (post.likes || 0) + 1 })
    .eq("id", id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── ADMIN: GET ALL POSTS (including unapproved) ───────
app.get("/api/admin/posts", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
});

// ── ADMIN: APPROVE POST ───────────────────────────────
app.post("/api/admin/posts/:id/approve", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { error } = await supabase
    .from("community_posts")
    .update({ approved: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── ADMIN: DELETE POST ────────────────────────────────
app.delete("/api/admin/posts/:id", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { error } = await supabase
    .from("community_posts")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── NEWSLETTER: SUBSCRIBE ─────────────────────────────
app.post("/api/newsletter", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ ok: false, error: "Email required" });

  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert([{ email, subscribed_at: new Date().toISOString() }], {
      onConflict: "email"
    });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, message: "Subscribed successfully" });
});

// ── NEWSLETTER: GET ALL (admin) ───────────────────────
app.get("/api/admin/subscribers", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("subscribed_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
});

// ── CONTACT FORM ──────────────────────────────────────
app.post("/api/contact", async (req, res) => {
  const { email, reason, message } = req.body;

  if (!message) return res.status(400).json({ ok: false, error: "Message required" });

  const { error } = await supabase
    .from("contact_messages")
    .insert([{
      email: email || "anonymous",
      reason: reason || null,
      message,
      read: false
    }]);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── ADMIN: GET CONTACT MESSAGES ───────────────────────
app.get("/api/admin/messages", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
});

// ── ADMIN: MARK MESSAGE READ ──────────────────────────
app.post("/api/admin/messages/:id/read", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { error } = await supabase
    .from("contact_messages")
    .update({ read: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

// ── ADMIN: STATS OVERVIEW ─────────────────────────────
app.get("/api/admin/stats", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const [submissions, posts, subscribers, messages] = await Promise.all([
    supabase.from("score_submissions").select("id, risk, result, country", { count: "exact" }),
    supabase.from("community_posts").select("id, approved", { count: "exact" }),
    supabase.from("newsletter_subscribers").select("id", { count: "exact" }),
    supabase.from("contact_messages").select("id, read", { count: "exact" })
  ]);

  const subData = submissions.data || [];
  const postData = posts.data || [];
  const msgData = messages.data || [];

  // Count by tier from result field
  // Tier classification — handles both result string and risk/score fields
  function getTier(s) {
    var r = (s.result || '').toLowerCase();
    if (r.includes('critical')) return 'critical';
    if (r.includes('high probability')) return 'high';
    if (r.includes('low')) return 'low';
    var rk = (s.risk || '').toLowerCase();
    if (rk === 'high') return 'high';
    if (rk === 'low') return 'low';
    var sc = parseInt(s.score);
    if (sc >= 17) return 'critical';
    if (sc >= 12) return 'high';
    if (sc > 0) return 'low';
    return 'unknown';
  }
  const critical = subData.filter(s => getTier(s) === 'critical').length;
  const highProb = subData.filter(s => getTier(s) === 'high').length;
  const lowRisk  = subData.filter(s => getTier(s) === 'low').length;

  res.json({
    ok: true,
    stats: {
      total_submissions: subData.length,
      critical_tier: critical,
      high_probability_tier: highProb,
      low_risk_tier: lowRisk,
      total_posts: postData.length,
      pending_moderation: postData.filter(p => !p.approved).length,
      total_subscribers: (subscribers.data || []).length,
      total_messages: msgData.length,
      unread_messages: msgData.filter(m => !m.read).length
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`OSB Server running on port ${PORT}`);
});
