const express = require("express");
const path = require("path");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send('window.APPS_SCRIPT_URL = "/api";');
});

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

app.post("/api", async (req, res) => {
  try {
    const encoded = encodeURIComponent(JSON.stringify(req.body));
    const url = APPS_SCRIPT_URL + "?payload=" + encoded;
    const text = await httpsGet(url);
    try {
      res.json(JSON.parse(text));
    } catch(e) {
      res.status(500).json({ ok: false, error: "Respuesta invalida: " + text.substring(0, 200) });
    }
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const text = await httpsGet(APPS_SCRIPT_URL + "?" + params.toString());
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
