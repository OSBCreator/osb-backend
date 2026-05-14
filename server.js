require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50kb" }));
app.use(express.static(__dirname));

// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── CIRCUIT BREAKER ───────────────────────────────────────────────────────────
const circuit = { failures: 0, lastFailure: null, open: false };
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS  = 60000;

function recordFailure() {
  const now = Date.now();
  if (circuit.lastFailure && now - circuit.lastFailure > CIRCUIT_RESET_MS) {
    circuit.failures = 0; circuit.open = false;
  }
  circuit.failures++;
  circuit.lastFailure = now;
  if (circuit.failures >= CIRCUIT_THRESHOLD) {
    circuit.open = true;
    console.warn("Circuit breaker OPEN");
    setTimeout(() => { circuit.open = false; circuit.failures = 0; console.log("Circuit breaker RESET"); }, CIRCUIT_RESET_MS);
  }
}

function circuitCheck(req, res, next) {
  if (circuit.open) return res.status(503).json({ ok: false, error: "Service temporarily unavailable. Please try again in a moment." });
  next();
}

// ── RATE LIMITING ─────────────────────────────────────────────────────────────
const rateLimits = new Map();

function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key   = req.ip;
    const now   = Date.now();
    const entry = rateLimits.get(key + windowMs) || { count: 0, start: now };
    if (now - entry.start > windowMs) { entry.count = 0; entry.start = now; }
    entry.count++;
    rateLimits.set(key + windowMs, entry);
    if (entry.count > max) return res.status(429).json({ ok: false, error: "Too many requests. Please slow down." });
    next();
  };
}

setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [key, val] of rateLimits.entries()) { if (val.start < cutoff) rateLimits.delete(key); }
}, 1800000);

const generalLimit   = rateLimit(900000, 120);
const scoreLimit     = rateLimit(3600000, 10);
const communityLimit = rateLimit(3600000, 15);
const contactLimit   = rateLimit(3600000, 5);

// ── TIMEOUT ───────────────────────────────────────────────────────────────────
function timeout(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) res.status(503).json({ ok: false, error: "Request timed out. Please try again." });
    }, ms);
    res.on("finish", () => clearTimeout(timer));
    res.on("close",  () => clearTimeout(timer));
    next();
  };
}

// ── GRACEFUL ASYNC WRAPPER ────────────────────────────────────────────────────
function wrap(fn) {
  return async (req, res, next) => {
    try { await fn(req, res, next); }
    catch (err) {
      console.error("Route error:", err.message);
      recordFailure();
      if (!res.headersSent) res.status(500).json({ ok: false, error: "An unexpected error occurred. Please try again." });
    }
  };
}

// ── INPUT SANITIZER ───────────────────────────────────────────────────────────
function sanitize(str, maxLen = 2000) {
  if (!str || typeof str !== "string") return null;
  return str.trim().slice(0, maxLen);
}

// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  next();
}

// ── DB QUERY WITH TIMEOUT ─────────────────────────────────────────────────────
async function dbQuery(queryFn, ms = 10000) {
  return Promise.race([
    queryFn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("DB timeout")), ms))
  ]);
}

// =============================================================================
// ROUTES
// =============================================================================

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.get("/health", (req, res) => res.json({
  ok: true, status: "OSB Backend operational",
  circuit: circuit.open ? "OPEN" : "CLOSED",
  uptime: Math.floor(process.uptime()) + "s"
}));

// ── SCORE SUBMISSION ──────────────────────────────────────────────────────────
app.post("/api/score", generalLimit, scoreLimit, circuitCheck, timeout(15000), wrap(async (req, res) => {
  const { user, email, country, platform, score, risk, result, money, story, timestamp } = req.body;
  const record = {
    user: sanitize(user, 100), email: sanitize(email, 200), country: sanitize(country, 100),
    platform: sanitize(platform, 100), score: score || null, risk: sanitize(risk, 50),
    result: sanitize(result, 200), money: sanitize(money, 100), story: sanitize(story, 2000),
    timestamp: timestamp || new Date().toISOString()
  };
  const { error } = await dbQuery(() => supabase.from("score_submissions").insert([record]));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: "Submission failed. Please try again." }); }
  res.json({ ok: true });
}));

// ── GET SUBMISSIONS (admin) ───────────────────────────────────────────────────
app.get("/api/submissions", adminAuth, generalLimit, timeout(15000), wrap(async (req, res) => {
  const { data, error } = await dbQuery(() => supabase.from("score_submissions").select("*").order("created_at", { ascending: false }));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
}));

// ── COMMUNITY: GET POSTS ──────────────────────────────────────────────────────
app.get("/api/community", generalLimit, circuitCheck, timeout(10000), wrap(async (req, res) => {
  const { pillar, limit } = req.query;
  let query = supabase.from("community_posts").select("*").eq("approved", true)
    .order("created_at", { ascending: false }).limit(Math.min(parseInt(limit) || 50, 200));
  if (pillar && pillar !== "all") query = query.eq("pillar", pillar.toUpperCase());
  const { data, error } = await dbQuery(() => query);
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: error.message }); }
  res.json({ ok: true, data });
}));

// ── COMMUNITY: NEW POST ───────────────────────────────────────────────────────
app.post("/api/community", communityLimit, circuitCheck, timeout(10000), wrap(async (req, res) => {
  const username = sanitize(req.body.username, 32);
  const content  = sanitize(req.body.content, 1200);
  const pillar   = sanitize(req.body.pillar, 10);
  const ifn_ref  = sanitize(req.body.ifn_ref, 20);
  if (!username || !content) return res.status(400).json({ ok: false, error: "Username and content required" });
  const { error } = await dbQuery(() => supabase.from("community_posts").insert([{ username, content, pillar: pillar||null, ifn_ref: ifn_ref||null, approved: false, likes: 0 }]));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: "Submission failed. Please try again." }); }
  res.json({ ok: true, message: "Post submitted for review" });
}));

// ── COMMUNITY: ASK PRIVATELY ──────────────────────────────────────────────────
app.post("/api/community/ask", communityLimit, circuitCheck, timeout(10000), wrap(async (req, res) => {
  const username = sanitize(req.body.username, 32);
  const content  = sanitize(req.body.content, 1200);
  if (!username || !content) return res.status(400).json({ ok: false, error: "Username and content required" });
  const { error } = await dbQuery(() => supabase.from("community_posts").insert([{ username, content, pillar: "PRIVATE", approved: false, likes: 0 }]));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: "Submission failed. Please try again." }); }
  res.json({ ok: true, message: "Your question has been sent to OSB privately." });
}));

// ── COMMUNITY: LIKE ───────────────────────────────────────────────────────────
app.post("/api/community/:id/like", generalLimit, circuitCheck, timeout(8000), wrap(async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) return res.status(400).json({ ok: false, error: "Invalid post ID" });
  const { data: post } = await dbQuery(() => supabase.from("community_posts").select("likes").eq("id", id).single());
  if (!post) return res.status(404).json({ ok: false, error: "Post not found" });
  const { error } = await dbQuery(() => supabase.from("community_posts").update({ likes: (post.likes||0)+1 }).eq("id", id));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: error.message }); }
  res.json({ ok: true });
}));

// ── NEWSLETTER ────────────────────────────────────────────────────────────────
app.post("/api/newsletter", generalLimit, circuitCheck, timeout(8000), wrap(async (req, res) => {
  const email = sanitize(req.body.email, 200);
  if (!email || !email.includes("@")) return res.status(400).json({ ok: false, error: "Valid email required" });
  const { error } = await dbQuery(() => supabase.from("newsletter_subscribers").upsert([{ email, subscribed_at: new Date().toISOString() }], { onConflict: "email" }));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: "Subscription failed." }); }
  res.json({ ok: true, message: "Subscribed successfully" });
}));

// ── CONTACT ───────────────────────────────────────────────────────────────────
app.post("/api/contact", contactLimit, circuitCheck, timeout(8000), wrap(async (req, res) => {
  const email   = sanitize(req.body.email, 200);
  const reason  = sanitize(req.body.reason, 100);
  const message = sanitize(req.body.message, 2000);
  if (!message) return res.status(400).json({ ok: false, error: "Message required" });
  const { error } = await dbQuery(() => supabase.from("contact_messages").insert([{ email: email||"anonymous", reason: reason||null, message, read: false }]));
  if (error) { recordFailure(); return res.status(500).json({ ok: false, error: "Message failed to send." }); }
  res.json({ ok: true });
}));

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────
app.get("/api/admin/posts", adminAuth, timeout(15000), wrap(async (req, res) => {
  const { data, error } = await dbQuery(() => supabase.from("community_posts").select("*").order("created_at", { ascending: false }));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
}));

app.post("/api/admin/posts/:id/approve", adminAuth, timeout(8000), wrap(async (req, res) => {
  const { error } = await dbQuery(() => supabase.from("community_posts").update({ approved: true }).eq("id", req.params.id));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}));

app.delete("/api/admin/posts/:id", adminAuth, timeout(8000), wrap(async (req, res) => {
  const { error } = await dbQuery(() => supabase.from("community_posts").delete().eq("id", req.params.id));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}));

app.get("/api/admin/subscribers", adminAuth, timeout(15000), wrap(async (req, res) => {
  const { data, error } = await dbQuery(() => supabase.from("newsletter_subscribers").select("*").order("subscribed_at", { ascending: false }));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
}));

app.get("/api/admin/messages", adminAuth, timeout(15000), wrap(async (req, res) => {
  const { data, error } = await dbQuery(() => supabase.from("contact_messages").select("*").order("created_at", { ascending: false }));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, data });
}));

app.post("/api/admin/messages/:id/read", adminAuth, timeout(8000), wrap(async (req, res) => {
  const { error } = await dbQuery(() => supabase.from("contact_messages").update({ read: true }).eq("id", req.params.id));
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}));

app.get("/api/admin/stats", adminAuth, timeout(20000), wrap(async (req, res) => {
  const [submissions, posts, subscribers, messages] = await Promise.all([
    dbQuery(() => supabase.from("score_submissions").select("id, risk, result, country", { count: "exact" })),
    dbQuery(() => supabase.from("community_posts").select("id, approved", { count: "exact" })),
    dbQuery(() => supabase.from("newsletter_subscribers").select("id", { count: "exact" })),
    dbQuery(() => supabase.from("contact_messages").select("id, read", { count: "exact" }))
  ]);
  const subData  = submissions.data || [];
  const postData = posts.data || [];
  const msgData  = messages.data || [];
  function getTier(s) {
    const r = (s.result||"").toLowerCase();
    if (r.includes("critical")) return "critical";
    if (r.includes("high probability")) return "high";
    if (r.includes("low")) return "low";
    const rk = (s.risk||"").toLowerCase();
    if (rk==="high") return "high"; if (rk==="low") return "low";
    const sc = parseInt(s.score);
    if (sc>=17) return "critical"; if (sc>=12) return "high"; if (sc>0) return "low";
    return "unknown";
  }
  res.json({ ok: true, stats: {
    total_submissions: subData.length,
    critical_tier: subData.filter(s=>getTier(s)==="critical").length,
    high_probability_tier: subData.filter(s=>getTier(s)==="high").length,
    low_risk_tier: subData.filter(s=>getTier(s)==="low").length,
    total_posts: postData.length,
    pending_moderation: postData.filter(p=>!p.approved).length,
    total_subscribers: (subscribers.data||[]).length,
    total_messages: msgData.length,
    unread_messages: msgData.filter(m=>!m.read).length,
    circuit_status: circuit.open ? "OPEN" : "CLOSED"
  }});
}));

// ── 404 & GLOBAL ERROR ────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ ok: false, error: "Endpoint not found" }));
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  if (!res.headersSent) res.status(500).json({ ok: false, error: "Internal server error" });
});

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`OSB Server running on port ${PORT} ✅ | Rate limiting: ON | Circuit breaker: ON`);
});
