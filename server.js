require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// serve static files
app.use(express.static(__dirname));

// supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// test route
app.get("/", (req, res) => {
  res.send("OSB Backend running");
});

// form route
app.get("/form.html", (req, res) => {
  res.sendFile(path.join(__dirname, "form.html"));
});

// submit route — FIXED to match frontend field names
app.post("/api/score", async (req, res) => {
  console.log("===== NEW SUBMISSION =====");
  console.log(req.body);

  const { result, email, country, platform, money, story, timestamp } = req.body;

  const { data, error } = await supabase
    .from("score_submissions")
    .insert([{
      user:

  console.log("===== NEW SUBMISSION =====");
  console.log(req.body);

  const { result, email, country, platform, money, story, timestamp } = req.body;

  const { data, error } = await supabase
    .from("score_submissions")
    .insert([{ 
      user: result || 'Anonymous', 
      email: email || 'Not provided', 
      country: country || 'Not provided', 
      platform: platform || 'Not provided', 
      score: result || 'N/A',
      risk: result || 'N/A', 
      money: money || 'Not provided', 
      story: story || 'Not provided' 
    }]);

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return res.status(500).json({ ok: false, error });
  }

  console.log("Saved to Supabase ✅");
  res.json({ ok: true });
});

// Public submissions endpoint
app.get('/submissions', async (req, res) => {
  const { data, error } = await supabase.from('score_submissions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Admin submissions endpoint
app.get('/api/submissions', async (req, res) => {
  const { data, error } = await supabase.from('score_submissions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// Admin routes
app.get('/api/admin/stats', async (req, res) => {
  const [subs, msgs, posts, nl] = await Promise.all([
    supabase.from('score_submissions').select('*'),
    supabase.from('contact_submissions').select('*'),
    supabase.from('community_posts').select('*'),
    supabase.from('subscribers').select('*')
  ]);
  const s = subs.data || [];
  const critical = s.filter(x => x.tier === 'critical' || x.result === 'critical').length;
  const high = s.filter(x => x.tier === 'high' || x.result === 'high probability').length;
  const unread = (msgs.data || []).filter(x => !x.is_read).length;
  res.json({
    total_submissions: s.length,
    critical_tier: critical,
    high_probability: high,
    unread_messages: unread,
    total_posts: (posts.data || []).length,
    total_subscribers: (nl.data || []).length
  });
});

app.get('/api/admin/messages', async (req, res) => {
  const { data, error } = await supabase.from('contact_submissions').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

app.post('/api/admin/messages/:id/read', async (req, res) => {
  const { error } = await supabase.from('contact_submissions').update({ is_read: true }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/subscribers', async (req, res) => {
  const { data, error } = await supabase.from('subscribers').select('*').order('subscribed_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

app.get('/api/admin/posts', async (req, res) => {
  const { data, error } = await supabase.from('community_posts').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

app.post('/api/admin/posts/:id/approve', async (req, res) => {
  const { error } = await supabase.from('community_posts').update({ is_approved: true }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete('/api/admin/posts/:id', async (req, res) => {
  const { error } = await supabase.from('community_posts').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.post('/api/community', async (req, res) => {
  const { username, content, pillar, ifn_ref } = req.body;
  const { data, error } = await supabase.from('community_posts').insert([{ username, content, pillar, ifn_ref, is_approved: false }]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// ✅ IMPORTANT (Railway fix)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});