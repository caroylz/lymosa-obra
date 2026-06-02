const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send('window.APPS_SCRIPT_URL = "/api";');
});

app.post("/api", async (req, res) => {
  try {
    const fetch = (await import("node-fetch")).default;
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      redirect: "follow",
    });
    const text = await response.text();
    try {
      res.json(JSON.parse(text));
    } catch(e) {
      res.status(500).json({ ok: false, error: "Respuesta invalida: " + text.substring(0, 100) });
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api", async (req, res) => {
  try {
    const fetch = (await import("node-fetch")).default;
    const params = new URLSearchParams(req.query);
    const response = await fetch(APPS_SCRIPT_URL + "?" + params.toString(), { redirect: "follow" });
    const text = await response.text();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=reporte.csv");
    res.send(text);
  } catch(e) {
    res.status(500).send("Error: " + e.message);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Lymosa Obra en puerto " + PORT));
