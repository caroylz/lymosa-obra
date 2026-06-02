const express = require("express");
const path = require("path");
const https = require("https");
const cloudinary = require("cloudinary").v2;

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dndeu8kmt",
  api_key:    process.env.CLOUDINARY_API_KEY    || "184334583281798",
  api_secret: process.env.CLOUDINARY_API_SECRET || "Ork3r_Sdmjgq3G5QciDaJJvOUvA",
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send('window.APPS_SCRIPT_URL = "/api";');
});

// ── Subir foto a Cloudinary ──
app.post("/api/foto", async (req, res) => {
  try {
    const { base64, filename } = req.body;
    if (!base64) return res.status(400).json({ ok: false, error: "Faltan datos" });

    const result = await cloudinary.uploader.upload(
      "data:image/jpeg;base64," + base64,
      {
        folder: "lymosa-obra",
        public_id: filename ? filename.replace(".jpg","") : undefined,
        resource_type: "image",
      }
    );

    res.json({ ok: true, url: result.secure_url, fileId: result.public_id });
  } catch (e) {
    console.error("Error subiendo foto:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Proxy hacia Apps Script (POST) ──
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
        return httpsGet(r.headers.location).then(resolve).catch(reject);
      let data = "";
      r.on("data", chunk => data += chunk);
      r.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

app.post("/api", async (req, res) => {
  try {
    const payload = JSON.stringify(req.body);
    const encoded = encodeURIComponent(payload);
    const url = APPS_SCRIPT_URL + "?payload=" + encoded;
    const text = await httpsGet(url);
    try {
      res.json(JSON.parse(text));
    } catch (e) {
      res.status(500).json({ ok: false, error: "Respuesta invalida: " + text.substring(0, 200) });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Proxy hacia Apps Script (GET / descarga CSV) ──
app.get("/api", async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const text = await httpsGet(APPS_SCRIPT_URL + "?" + params.toString());
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=reporte.csv");
    res.send(text);
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log("Lymosa Obra en puerto " + PORT));
