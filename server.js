require("dotenv").config();

const express = require("express");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();

app.use(express.json());
app.use(express.static(__dirname)); // serve HTML files

// SUPABASE
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔥 SERVE YOUR REAL SCORING TOOL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "scoring-tool-inner.html"));
});

// API ROUTE
app.post("/api/score", async (req, res) => {
  console.log("DATA RECEIVED:", req.body);

  const { data, error } = await supabase
    .from("score_submissions")
    .insert([req.body]);

  if (error) {
    console.error("SUPABASE ERROR:", error);
    return res.status(500).json({ error });
  }

  console.log("Saved to Supabase ✅");
  res.json({ ok: true });
});

// START SERVER
app.listen(5000, () => {
  console.log("RUNNING → http://localhost:5000");
});