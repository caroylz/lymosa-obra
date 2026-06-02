const express = require("express");
const path = require("path");
const https = require("https");
const { google } = require("googleapis");

const app = express();
const PORT = process.env.PORT || 3000;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || "1zFsoAKLNBEkHeVTPxvM24a4wPSmKgk5k";

// ── Google Drive auth desde variable de entorno ──
let driveClient = null;
function getDrive() {
  if (driveClient) return driveClient;
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurado");
  const key = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/config.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send('window.APPS_SCRIPT_URL = "/api";');
});

// ── Subir foto a Google Drive ──
app.post("/api/foto", async (req, res) => {
  try {
    const { base64, filename, mimeType } = req.body;
    if (!base64 || !filename) return res.status(400).json({ ok: false, error: "Faltan datos" });

    const drive = getDrive();
    const buffer = Buffer.from(base64, "base64");
    const { Readable } = require("stream");
    const stream = Readable.from(buffer);

    const file = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: mimeType || "image/jpeg",
        body: stream,
      },
      fields: "id, webViewLink, webContentLink",
    });

    // Hacer el archivo público (visible con link)
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // URL directa para mostrar en la app
    const url = `https://drive.google.com/uc?export=view&id=${file.data.id}`;

    res.json({ ok: true, url, fileId: file.data.id });
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
