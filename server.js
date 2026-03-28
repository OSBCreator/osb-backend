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

// submit route
app.post("/api/score", async (req, res) => {
  console.log("===== NEW SUBMISSION =====");
  console.log(req.body);

  const { user, email, country, platform, score, risk, money, story } = req.body;

  const { data, error } = await supabase
    .from("score_submissions")
    .insert([{ user, email, country, platform, score, risk, money, story }]);

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return res.status(500).json({ ok: false, error });
  }

  console.log("Saved to Supabase ✅");
  res.json({ ok: true });
});

// ✅ IMPORTANT (Railway fix)
const PORT = process.env.PORT || 5000;


app.get('/submissions', async (req, res) => {
  const { data, error } = await supabase.from('score_submissions').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});\napp.get('/submissions', async (req, res) => {\n  const { data, error } = await supabase.from('score_submissions').select('*');\n  if (error) return res.status(500).json({ error: error.message });\n  res.json(data);\n});
