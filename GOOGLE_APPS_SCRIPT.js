// ============================================================
// LYMOSA OBRA — Google Apps Script Backend
// Pegar este código en: Extensions > Apps Script
// Luego: Deploy > New deployment > Web app
//   - Execute as: Me
//   - Who has access: Anyone
// Copiar la URL del deployment y pegarla en el .env de la app
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();

// ── Nombres de hojas ─────────────────────────────────────────
const SHEET = {
  REGISTROS:   "Registros",
  USUARIOS:    "Usuarios",
  OBRAS:       "Obras",
  PROVEEDORES: "Proveedores",
  VEHICULOS:   "Vehiculos",
  MATERIALES:  "Materiales",
  UNIDADES:    "Unidades",
};

// ── CORS helper ──────────────────────────────────────────────
function cors(output) {
  return output
    .setHeader("Access-Control-Allow-Origin", "*")
    .setHeader("Access-Control-Allow-Methods", "GET,POST")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function doOptions() {
  return cors(ContentService.createTextOutput(""));
}

// ── Router principal ─────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action } = body;
    let result;

    switch (action) {
      case "login":           result = login(body);           break;
      case "nuevoRegistro":   result = nuevoRegistro(body);   break;
      case "getCatalogos":    result = getCatalogos(body);    break;
      case "agregarProveedor":result = agregarCatalogo(SHEET.PROVEEDORES, body.nombre); break;
      case "agregarVehiculo": result = agregarVehiculo(body); break;
      case "agregarMaterial": result = agregarCatalogo(SHEET.MATERIALES, body.nombre);  break;
      case "agregarUnidad":   result = agregarCatalogo(SHEET.UNIDADES, body.nombre);    break;
      // Admin
      case "getUsuarios":     result = getHoja(SHEET.USUARIOS);   break;
      case "getObras":        result = getObras();                 break;
      case "crearUsuario":    result = crearUsuario(body);         break;
      case "activarDispositivo": result = activarDispositivo(body); break;
      case "getRegistros":    result = getRegistrosFiltrados(body); break;
      case "getResumen":      result = getResumen(body);           break;
      default: result = { ok: false, error: "Acción desconocida" };
    }

    return cors(ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON));

  } catch (err) {
    return cors(ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON));
  }
}

function doGet(e) {
  // Permite descargar excel de registros filtrados
  const { desde, hasta, obraId } = e.parameter;
  return generarExcel(desde, hasta, obraId);
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
        return { ok: false, error: "Este usuario ya está activado en otro dispositivo." };
      }

      // Verificar geovalla si tiene obra asignada
      if (obraId && lat && lng) {
        const obra = getObraById(obraId);
        if (obra) {
          const dist = distanciaMetros(lat, lng, obra.lat, obra.lng);
          if (dist > obra.radio) {
            return {
              ok: false,
              error: `Estás a ${Math.round(dist)}m de la obra. Necesitas estar dentro de ${obra.radio}m.`,
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
    lat, lng,
    now
  ]);

  return { ok: true, folio };
}

// ── CATÁLOGOS ────────────────────────────────────────────────
function getCatalogos({ obraId }) {
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
  // Generar clave aleatoria de 6 caracteres
  const clave = Math.random().toString(36).substring(2, 8).toUpperCase();
  sh.appendRow([id, nombre, clave, rol || "residente", obraId || "", "", true, ""]);
  return { ok: true, id, nombre, clave };
}

function activarDispositivo({ usuarioId, deviceId }) {
  const sh = SS.getSheetByName(SHEET.USUARIOS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === usuarioId) {
      sh.getRange(i + 1, 6).setValue(deviceId); // limpiar y reasignar
      return { ok: true };
    }
  }
  return { ok: false, error: "Usuario no encontrado" };
}

// ── ADMIN: REPORTES ──────────────────────────────────────────
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

    const key = `${material}|${unidad}`;
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
  const { rows, headers } = getRegistrosFiltrados({ desde, hasta, obraId });
  let csv = headers.join(",") + "\n";
  rows.forEach(r => {
    csv += r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",") + "\n";
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

function getObras() {
  return getHoja(SHEET.OBRAS);
}

function getObraById(id) {
  const obras = getObras();
  return obras.find(o => o.id === id) || null;
}

function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── SETUP INICIAL ────────────────────────────────────────────
// Ejecutar UNA SOLA VEZ para crear la estructura del sheet
function setupInicial() {
  crearHoja(SHEET.REGISTROS, [
    "folio","fecha","hora",
    "obraId","obraNombre",
    "usuarioId","usuarioNombre",
    "proveedorId","proveedorNombre",
    "vehiculoId","placas","descripcionVehiculo",
    "materialId","materialNombre",
    "cantidad","unidad",
    "lat","lng","timestamp"
  ]);

  crearHoja(SHEET.USUARIOS, [
    "id","nombre","clave","rol","obraId","deviceId","activo","activadoEn"
  ]);

  crearHoja(SHEET.OBRAS, [
    "id","nombre","direccion","lat","lng","radio","activa"
  ]);

  crearHoja(SHEET.PROVEEDORES, ["id","nombre","creadoEn"]);
  crearHoja(SHEET.VEHICULOS,   ["id","placas","descripcion","proveedorId","proveedorNombre","creadoEn"]);
  crearHoja(SHEET.MATERIALES,  ["id","nombre","creadoEn"]);
  crearHoja(SHEET.UNIDADES,    ["id","nombre","creadoEn"]);

  // Insertar obras iniciales
  const shObras = SS.getSheetByName(SHEET.OBRAS);
  shObras.appendRow(["OBR-001","Manantiales","Calle Calz. Salto de Agua 1150, Ramos Arizpe, Coah.",25.514544130620592,-100.93820846798707,100,true]);
  shObras.appendRow(["OBR-002","Ribereña","Benito Juárez S/N, Ribereña 900, Reynosa, Tamps.",26.089545972590226,-98.29281052815551,150,true]);

  // Materiales iniciales
  const shMat = SS.getSheetByName(SHEET.MATERIALES);
  [["MAT-001","TIERRA"],["MAT-002","AGUA"],["MAT-003","ARENA"],
   ["MAT-004","GRAVA"],["MAT-005","PIEDRA"],["MAT-006","MATERIAL HIDRÁULICA"]]
    .forEach(r => shMat.appendRow([...r, new Date()]));

  // Unidades iniciales
  const shUn = SS.getSheetByName(SHEET.UNIDADES);
  [["UN-001","TONELADAS"],["UN-002","M3"],["UN-003","KG"],["UN-004","VIAJE"]]
    .forEach(r => shUn.appendRow([...r, new Date()]));

  // Vehículos iniciales (de la lista del arquitecto)
  const shVeh = SS.getSheetByName(SHEET.VEHICULOS);
  const tolvas = [
    "1AF-797-A","1AG-855-A","2AG-109-A","2AG-612-A","2AG-950-A","2AG-983-A",
    "3AF-347-A","3AG-505-A","4A6-547-A","4AG-219-A","4AG-547-A","4AG-771-A",
    "5AG-023-A","5AG-909-A","6AG-219-A","8AG-356-A","9AF-781-A","AP-14-762",
    "AY-7139-A","BJO-095-A-A"
  ];
  const tortons = ["BD-5785-A","BD-5786-A"];
  tolvas.forEach((p,i) => shVeh.appendRow([`VEH-${100+i}`,p,"TOLVA","","TUCURUGUAY",new Date()]));
  tortons.forEach((p,i) => shVeh.appendRow([`VEH-${200+i}`,p,"TORTON","","TUCURUGUAY",new Date()]));

  // Usuario admin inicial
  const shUsr = SS.getSheetByName(SHEET.USUARIOS);
  shUsr.appendRow(["USR-001","Paco (Admin)","ADMIN1","admin","","",true,""]);
  shUsr.appendRow(["USR-002","Alberto Ariel Alcalá","ALBA01","residente","OBR-001","",true,""]);
  shUsr.appendRow(["USR-003","José Francisco Gómez","JOSE01","residente","OBR-002","",true,""]);

  Logger.log("✅ Setup completado. Claves iniciales: ADMIN1 / ALBA01 / JOSE01");
}

function crearHoja(nombre, headers) {
  let sh = SS.getSheetByName(nombre);
  if (!sh) sh = SS.insertSheet(nombre);
  else sh.clearContents();
  sh.appendRow(headers);
  sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#1a3c5e").setFontColor("#ffffff");
  sh.setFrozenRows(1);
}
