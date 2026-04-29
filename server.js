require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
const OSB_FROM   = "OSB Intelligence <reports@onlinesecuritybureau.com>";
const OSB_NOTIFY = "contact@onlinesecuritybureau.com"; // where YOU receive alerts

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── ROOT ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ── SCORE SUBMISSION ──────────────────────────────────
app.post("/api/score", async (req, res) => {
  console.log("===== NEW SCORE SUBMISSION =====");

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
    intel_consent,
    report_image,
    timestamp
  } = req.body;

  // ── 1. Save to Supabase ──────────────────────────────
  const record = {
    user:      user     || null,
    email:     email    || null,
    country:   country  || null,
    platform:  platform || null,
    score:     score    || null,
    risk:      risk     || null,
    result:    result   || null,
    money:     money    || null,
    story:     story    || null,
    timestamp: timestamp || new Date().toISOString()
  };

  const { error: dbError } = await supabase
    .from("score_submissions")
    .insert([record]);

  if (dbError) {
    console.error("SUPABASE ERROR:", dbError);
    return res.status(500).json({ ok: false, error: dbError.message });
  }
  console.log("Saved to Supabase ✅");

  // ── 2. Build report image attachment (if present) ────
  const attachments = [];
  if (report_image && report_image.startsWith("data:image/jpeg;base64,")) {
    const base64Data = report_image.replace("data:image/jpeg;base64,", "");
    attachments.push({
      filename: `OSB-RSEI-Assessment-${new Date().toISOString().slice(0,10)}.jpg`,
      content:  base64Data,
      encoding: "base64"
    });
  }

  // ── 3. Notify OSB internally ─────────────────────────
  const notifyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <div style="background:#07070E;padding:20px 24px;border-bottom:3px solid #C0272D;">
        <img src="https://onlinesecuritybureau.com/logo.png" alt="OSB" style="height:40px;">
      </div>
      <div style="padding:24px;background:#f9f7f4;border:1px solid #e0ddd8;">
        <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C0272D;margin:0 0 16px;">New RSEI Assessment Submitted</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#666;width:140px;">Score / Tier</td><td style="padding:8px 0;font-weight:600;">${result || "—"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;">${email || "Not provided"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Country</td><td style="padding:8px 0;">${country || "Not provided"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Platform</td><td style="padding:8px 0;">${platform || "Not provided"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Money sent?</td><td style="padding:8px 0;">${money || "Not provided"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Intel consent</td><td style="padding:8px 0;">${intel_consent ? "Yes" : "No"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;vertical-align:top;">Their story</td><td style="padding:8px 0;line-height:1.6;">${story || "Not provided"}</td></tr>
          <tr><td style="padding:8px 0;color:#666;">Submitted</td><td style="padding:8px 0;">${timestamp || new Date().toLocaleString()}</td></tr>
        </table>
      </div>
      <div style="padding:12px 24px;background:#fff;border:1px solid #e0ddd8;border-top:none;font-size:11px;color:#999;">
        OSB · onlinesecuritybureau.com · Internal notification — do not reply to this address
      </div>
    </div>`;

  try {
    await resend.emails.send({
      from:        OSB_FROM,
      to:          OSB_NOTIFY,
      subject:     `[OSB] New RSEI Submission — ${result || "Score received"}`,
      html:        notifyHtml,
      attachments: attachments
    });
    console.log("OSB notification sent ✅");
  } catch (e) {
    console.error("Resend notify error:", e.message);
    // Non-fatal — don't fail the request
  }

  // ── 4. Send report to user (if email provided) ───────
  if (email && email.includes("@")) {
    const userHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
        <div style="background:#07070E;padding:20px 24px;border-bottom:3px solid #C0272D;">
          <img src="https://onlinesecuritybureau.com/logo.png" alt="OSB" style="height:40px;">
        </div>
        <div style="padding:28px 24px;background:#f9f7f4;border:1px solid #e0ddd8;">
          <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C0272D;margin:0 0 20px;">Your RSEI Assessment Report</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Thank you for completing your assessment.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 16px;">Your report is attached to this email as a JPEG. Keep it for your records — it contains your full RSEI score and pillar breakdown.</p>
          <div style="background:#fff;border:1px solid #e0ddd8;border-left:3px solid #C0272D;padding:16px 20px;margin:20px 0;font-size:14px;line-height:1.7;">
            <strong>Your result:</strong><br>${result || "See attached report"}
          </div>
          <p style="font-size:14px;color:#555;line-height:1.7;">John Dee will review your situation and will be in touch if a personal response is needed. You can also find OSB on Quora: <a href="https://www.quora.com/profile/John-Dee-2617" style="color:#C0272D;">John Dee — OSB</a></p>
          <p style="font-size:14px;color:#555;line-height:1.7;margin-top:16px;">You are not alone. Clarity is not defeat — it is the first step to freedom.</p>
        </div>
        <div style="padding:12px 24px;background:#fff;border:1px solid #e0ddd8;border-top:none;font-size:11px;color:#999;">
          OSB · <a href="https://onlinesecuritybureau.com" style="color:#C0272D;text-decoration:none;">onlinesecuritybureau.com</a> · 
          <a href="https://onlinesecuritybureau.com/privacy.html" style="color:#999;">Privacy Policy</a> · 
          You received this because you completed an RSEI assessment and provided your email.
        </div>
      </div>`;

    try {
      await resend.emails.send({
        from:        OSB_FROM,
        to:          email,
        subject:     "Your OSB RSEI Assessment Report",
        html:        userHtml,
        attachments: attachments
      });
      console.log(`User report sent to ${email} ✅`);
    } catch (e) {
      console.error("Resend user email error:", e.message);
      // Non-fatal
    }
  }

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

// ── PUBLIC: GET PLATFORM STATS ───────────────────────
app.get("/api/platform-stats", async (req, res) => {
  const { data, error } = await supabase
    .from("platform_stats")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, stats: data });
});

// ── ADMIN: UPDATE PLATFORM STATS ─────────────────────
app.post("/api/admin/platform-stats", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const { quora_reach, quora_views, quora_assessments, quora_engagements, ifn_count } = req.body;

  const { error } = await supabase
    .from("platform_stats")
    .upsert([{
      id: 1,
      quora_reach: parseInt(quora_reach) || 0,
      quora_views: parseInt(quora_views) || 0,
      quora_assessments: parseInt(quora_assessments) || 0,
      quora_engagements: parseInt(quora_engagements) || 0,
      ifn_count: parseInt(ifn_count) || 0,
      updated_at: new Date().toISOString()
    }], { onConflict: "id" });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, message: "Stats updated successfully" });
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
