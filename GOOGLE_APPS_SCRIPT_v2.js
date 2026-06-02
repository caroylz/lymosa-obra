// ============================================================
// LYMOSA OBRA — Google Apps Script Backend v2
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEET = {
  REGISTROS:   "Registros",
  USUARIOS:    "Usuarios",
  OBRAS:       "Obras",
  PROVEEDORES: "Proveedores",
  VEHICULOS:   "Vehiculos",
  MATERIALES:  "Materiales",
  UNIDADES:    "Unidades",
};

function cors(output) {
  try {
    return output
      .setHeader("Access-Control-Allow-Origin", "*")
      .setHeader("Access-Control-Allow-Methods", "GET,POST")
      .setHeader("Access-Control-Allow-Headers", "Content-Type");
  } catch(e) {
    return output;
  }
}

function doOptions() {
  return cors(ContentService.createTextOutput(""));
}

// ── Router GET (usado por el proxy Node.js) ──────────────────
function doGet(e) {
  try {
    // Si viene payload = petición de la app
    if (e.parameter && e.parameter.payload) {
      const body = JSON.parse(e.parameter.payload);
      const result = dispatch(body);
      return cors(ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON));
    }
    // Si viene desde/hasta = descarga CSV
    const { desde, hasta, obraId } = e.parameter || {};
    return generarExcel(desde, hasta, obraId);
  } catch(err) {
    return cors(ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

// ── Router POST (fallback directo) ───────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const result = dispatch(body);
    return cors(ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON));
  } catch(err) {
    return cors(ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

// ── Dispatch central ─────────────────────────────────────────
function dispatch(body) {
  const { action } = body;
  switch (action) {
    case "login":            return login(body);
    case "nuevoRegistro":    return nuevoRegistro(body);
    case "getCatalogos":     return getCatalogos(body);
    case "agregarProveedor": return agregarCatalogo(SHEET.PROVEEDORES, body.nombre);
    case "agregarVehiculo":  return agregarVehiculo(body);
    case "agregarMaterial":  return agregarCatalogo(SHEET.MATERIALES, body.nombre);
    case "agregarUnidad":    return agregarCatalogo(SHEET.UNIDADES, body.nombre);
    case "getUsuarios":      return getHojaRaw(SHEET.USUARIOS);
    case "getObras":         return { ok: true, data: getObras() };
    case "crearUsuario":     return crearUsuario(body);
    case "activarDispositivo": return activarDispositivo(body);
    case "getRegistros":     return getRegistrosFiltrados(body);
    case "getResumen":       return getResumen(body);
    default: return { ok: false, error: "Accion desconocida: " + action };
  }
}

// ── LOGIN ────────────────────────────────────────────────────
function login({ clave, deviceId, lat, lng }) {
  const sh = SS.getSheetByName(SHEET.USUARIOS);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const [id, nombre, claveGuardada, rol, obraId, deviceGuardado, activo] = data[i];

    if (String(claveGuardada).trim() === String(clave).trim() && activo) {

      // Primera activación: guardar device
      if (!deviceGuardado) {
        sh.getRange(i + 1, 6).setValue(deviceId);
        sh.getRange(i + 1, 8).setValue(new Date());
      } else if (String(deviceGuardado) !== String(deviceId)) {
        return { ok: false, error: "Este usuario ya esta activado en otro dispositivo." };
      }

      // Admin no tiene restriccion de geovalla
      if (rol === "admin") {
        return {
          ok: true,
          usuario: { id, nombre, rol, obraId },
          obra: null
        };
      }

      // Verificar geovalla para residentes
      if (obraId && lat && lng) {
        const obra = getObraById(obraId);
        if (obra) {
          const dist = distanciaMetros(lat, lng, obra.lat, obra.lng);
          if (dist > obra.radio) {
            return {
              ok: false,
              error: "Estas a " + Math.round(dist) + "m de la obra. Necesitas estar dentro de " + obra.radio + "m.",
              dist: Math.round(dist)
            };
          }
        }
      }

      return {
        ok: true,
        usuario: { id, nombre, rol, obraId },
        obra: obraId ? getObraById(obraId) : null
      };
    }
  }
  return { ok: false, error: "Clave incorrecta o usuario inactivo." };
}

// ── NUEVO REGISTRO ───────────────────────────────────────────
function nuevoRegistro({ usuarioId, usuarioNombre, obraId, obraNombre,
                         proveedorId, proveedorNombre,
                         vehiculoId, placas, descripcionVehiculo,
                         materialId, materialNombre,
                         unidad, cantidad, lat, lng }) {
  const sh = SS.getSheetByName(SHEET.REGISTROS);
  const now = new Date();
  const fecha = Utilities.formatDate(now, "America/Mexico_City", "yyyy-MM-dd");
  const hora  = Utilities.formatDate(now, "America/Mexico_City", "HH:mm:ss");
  const folio = "REG-" + Utilities.formatDate(now, "America/Mexico_City", "yyyyMMddHHmmss");

  sh.appendRow([
    folio, fecha, hora,
    obraId, obraNombre,
    usuarioId, usuarioNombre,
    proveedorId, proveedorNombre,
    vehiculoId, placas, descripcionVehiculo,
    materialId, materialNombre,
    cantidad, unidad,
    lat, lng, now
  ]);

  return { ok: true, folio };
}

// ── CATÁLOGOS ────────────────────────────────────────────────
function getCatalogos() {
  return {
    ok: true,
    proveedores: getHoja(SHEET.PROVEEDORES),
    vehiculos:   getHoja(SHEET.VEHICULOS),
    materiales:  getHoja(SHEET.MATERIALES),
    unidades:    getHoja(SHEET.UNIDADES),
    obras:       getObras(),
  };
}

function agregarCatalogo(hojaNombre, nombre) {
  if (!nombre) return { ok: false, error: "Nombre requerido" };
  const sh = SS.getSheetByName(hojaNombre);
  const id = hojaNombre.substring(0,3).toUpperCase() + "-" + Date.now();
  sh.appendRow([id, nombre.toUpperCase().trim(), new Date()]);
  return { ok: true, id, nombre: nombre.toUpperCase().trim() };
}

function agregarVehiculo({ placas, descripcion, proveedorId, proveedorNombre }) {
  const sh = SS.getSheetByName(SHEET.VEHICULOS);
  const id = "VEH-" + Date.now();
  const p = (placas || "").toUpperCase().trim();
  const d = (descripcion || "").toUpperCase().trim();
  sh.appendRow([id, p, d, proveedorId, proveedorNombre, new Date()]);
  return { ok: true, id, placas: p, descripcion: d };
}

// ── ADMIN: USUARIOS ──────────────────────────────────────────
function crearUsuario({ nombre, rol, obraId }) {
  const sh = SS.getSheetByName(SHEET.USUARIOS);
  const id = "USR-" + Date.now();
  const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
  sh.appendRow([id, nombre, clave, rol || "residente", obraId || "", "", true, ""]);
  return { ok: true, id, nombre, clave };
}

function activarDispositivo({ usuarioId, deviceId }) {
  const sh = SS.getSheetByName(SHEET.USUARIOS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === usuarioId) {
      sh.getRange(i + 1, 6).setValue(deviceId);
      return { ok: true };
    }
  }
  return { ok: false, error: "Usuario no encontrado" };
}

// ── REPORTES ─────────────────────────────────────────────────
function getRegistrosFiltrados({ desde, hasta, obraId, proveedorId, materialId }) {
  const sh = SS.getSheetByName(SHEET.REGISTROS);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).filter(r => {
    const fecha = r[1];
    if (!fecha) return false;
    const f = new Date(fecha);
    if (desde && f < new Date(desde)) return false;
    if (hasta && f > new Date(hasta + "T23:59:59")) return false;
    if (obraId && r[3] !== obraId) return false;
    if (proveedorId && r[7] !== proveedorId) return false;
    if (materialId && r[12] !== materialId) return false;
    return true;
  });
  return { ok: true, headers, rows };
}

function getResumen({ desde, hasta, obraId }) {
  const { rows } = getRegistrosFiltrados({ desde, hasta, obraId });
  const byMaterial = {};
  const byProveedor = {};
  let total = 0;

  rows.forEach(r => {
    const material = r[13];
    const proveedor = r[8];
    const cantidad = parseFloat(r[14]) || 0;
    const unidad = r[15];
    const key = material + "|" + unidad;
    if (!byMaterial[key]) byMaterial[key] = { material, unidad, total: 0, viajes: 0 };
    byMaterial[key].total += cantidad;
    byMaterial[key].viajes++;
    if (!byProveedor[proveedor]) byProveedor[proveedor] = { proveedor, total: 0, viajes: 0 };
    byProveedor[proveedor].total += cantidad;
    byProveedor[proveedor].viajes++;
    total += cantidad;
  });

  return {
    ok: true,
    totalRegistros: rows.length,
    totalVolumen: total,
    porMaterial: Object.values(byMaterial),
    porProveedor: Object.values(byProveedor),
  };
}

function generarExcel(desde, hasta, obraId) {
  const { rows, headers } = getRegistrosFiltrados({ desde: desde||"", hasta: hasta||"", obraId: obraId||"" });
  let csv = (headers||[]).join(",") + "\n";
  (rows||[]).forEach(r => {
    csv += r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(",") + "\n";
  });
  return ContentService
    .createTextOutput(csv)
    .setMimeType(ContentService.MimeType.CSV);
}

// ── HELPERS ──────────────────────────────────────────────────
function getHoja(nombre) {
  const sh = SS.getSheetByName(nombre);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function getHojaRaw(nombre) {
  return getHoja(nombre);
}

function getObras() {
  return getHoja(SHEET.OBRAS);
}

function getObraById(id) {
  return getObras().find(o => o.id === id) || null;
}

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── SETUP INICIAL (correr solo una vez) ──────────────────────
function setupInicial() {
  crearHoja(SHEET.REGISTROS, [
    "folio","fecha","hora","obraId","obraNombre",
    "usuarioId","usuarioNombre","proveedorId","proveedorNombre",
    "vehiculoId","placas","descripcionVehiculo","materialId","materialNombre",
    "cantidad","unidad","lat","lng","timestamp"
  ]);
  crearHoja(SHEET.USUARIOS,    ["id","nombre","clave","rol","obraId","deviceId","activo","activadoEn"]);
  crearHoja(SHEET.OBRAS,       ["id","nombre","direccion","lat","lng","radio","activa"]);
  crearHoja(SHEET.PROVEEDORES, ["id","nombre","creadoEn"]);
  crearHoja(SHEET.VEHICULOS,   ["id","placas","descripcion","proveedorId","proveedorNombre","creadoEn"]);
  crearHoja(SHEET.MATERIALES,  ["id","nombre","creadoEn"]);
  crearHoja(SHEET.UNIDADES,    ["id","nombre","creadoEn"]);

  const shObras = SS.getSheetByName(SHEET.OBRAS);
  shObras.appendRow(["OBR-001","Manantiales","Calle Calz. Salto de Agua 1150, Ramos Arizpe, Coah.",25.514544130620592,-100.93820846798707,100,true]);
  shObras.appendRow(["OBR-002","Ribereña","Benito Juárez S/N, Ribereña 900, Reynosa, Tamps.",26.089545972590226,-98.29281052815551,150,true]);

  const shMat = SS.getSheetByName(SHEET.MATERIALES);
  [["MAT-001","TIERRA"],["MAT-002","AGUA"],["MAT-003","ARENA"],
   ["MAT-004","GRAVA"],["MAT-005","PIEDRA"],["MAT-006","MATERIAL HIDRAULICA"]]
    .forEach(r => shMat.appendRow([...r, new Date()]));

  const shUn = SS.getSheetByName(SHEET.UNIDADES);
  [["UN-001","TONELADAS"],["UN-002","M3"],["UN-003","KG"],["UN-004","VIAJE"]]
    .forEach(r => shUn.appendRow([...r, new Date()]));

  const shVeh = SS.getSheetByName(SHEET.VEHICULOS);
  const tolvas = [
    "1AF-797-A","1AG-855-A","2AG-109-A","2AG-612-A","2AG-950-A","2AG-983-A",
    "3AF-347-A","3AG-505-A","4A6-547-A","4AG-219-A","4AG-547-A","4AG-771-A",
    "5AG-023-A","5AG-909-A","6AG-219-A","8AG-356-A","9AF-781-A","AP-14-762",
    "AY-7139-A","BJO-095-A-A"
  ];
  tolvas.forEach((p,i) => shVeh.appendRow(["VEH-"+(100+i), p, "TOLVA", "", "TUCURUGUAY", new Date()]));
  [["VEH-200","BD-5785-A","TORTON"],["VEH-201","BD-5786-A","TORTON"]]
    .forEach(r => shVeh.appendRow([...r, "", "TUCURUGUAY", new Date()]));

  const shUsr = SS.getSheetByName(SHEET.USUARIOS);
  shUsr.appendRow(["USR-001","Paco (Admin)","ADMIN1","admin","","",true,""]);
  shUsr.appendRow(["USR-002","Alberto Ariel Alcala","ALBA01","residente","OBR-001","",true,""]);
  shUsr.appendRow(["USR-003","Jose Francisco Gomez","JOSE01","residente","OBR-002","",true,""]);

  Logger.log("Setup completado. Claves: ADMIN1 / ALBA01 / JOSE01");
}

function crearHoja(nombre, headers) {
  let sh = SS.getSheetByName(nombre);
  if (!sh) sh = SS.insertSheet(nombre);
  else sh.clearContents();
  sh.appendRow(headers);
  sh.getRange(1,1,1,headers.length).setFontWeight("bold").setBackground("#1a3c5e").setFontColor("#ffffff");
  sh.setFrozenRows(1);
}