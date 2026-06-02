# Lymosa Obra — Guía de despliegue

## Archivos del proyecto
```
lymosa-obra/
├── server.js              ← servidor Node.js
├── package.json
├── public/
│   ├── index.html         ← app completa
│   ├── manifest.json      ← PWA
│   └── sw.js              ← service worker
└── GOOGLE_APPS_SCRIPT.js  ← pegar en Google Sheets
```

---

## PASO 1 — Configurar Google Sheets

1. Ir a sheets.google.com → crear un Google Sheet nuevo
   - Nombre: **Lymosa Obra - Registros**

2. En el Sheet: menú **Extensions → Apps Script**

3. Borrar el código que aparece y **pegar todo el contenido** de `GOOGLE_APPS_SCRIPT.js`

4. Guardar (Ctrl+S), nombre del proyecto: **LymosaObraBackend**

5. En el editor, buscar la función `setupInicial` y hacer clic en **▶ Run**
   - Aceptar los permisos que pida Google
   - En el log debe aparecer: `✅ Setup completado. Claves iniciales: ADMIN1 / ALBA01 / JOSE01`
   - Esto crea las 7 hojas y carga los datos iniciales (obras, materiales, vehículos, usuarios)

6. **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Clic en **Deploy**
   - **Copiar la URL** que aparece (termina en `/exec`)
   - Ejemplo: `https://script.google.com/macros/s/AKfycb.../exec`

---

## PASO 2 — Subir a GitHub

En tu Mac, desde Terminal:

```bash
# 1. Ir a la carpeta del proyecto
cd ~/Downloads/lymosa-obra

# 2. Iniciar git
git init
git add .
git commit -m "Lymosa Obra v1.0"

# 3. Crear repo en GitHub (igual que hiciste con lymosa-app)
gh repo create lymosa-obra --public --push --source=.
```

---

## PASO 3 — Deploy en Render

1. Ir a render.com → **New → Web Service**
2. Conectar el repo `lymosa-obra`
3. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node version:** 18

4. En **Environment Variables**, agregar:
   - `APPS_SCRIPT_URL` = la URL que copiaste en el Paso 1

5. Clic en **Create Web Service**
6. Esperar ~2 min → la app quedará en `https://lymosa-obra.onrender.com`

---

## PASO 4 — Agregar config.js al HTML

En `public/index.html`, antes del cierre `</head>`, agregar:
```html
<script src="/config.js"></script>
```
Luego hacer git push para actualizar Render.

---

## Claves iniciales

| Usuario | Clave | Rol | Obra |
|---|---|---|---|
| Paco (Admin) | ADMIN1 | admin | — |
| Alberto Ariel Alcalá | ALBA01 | residente | Manantiales |
| José Francisco Gómez | JOSE01 | residente | Ribereña |

> **Nota:** Al primer login, el dispositivo queda bloqueado. Si un residente cambia de celular, el admin puede resetear desde el Sheet (columna deviceId de la hoja Usuarios, borrar el valor).

---

## Cambiar claves después

Desde el panel admin → Usuarios → el admin puede crear nuevos usuarios con claves autogeneradas.

---

## Estructura del Google Sheet

| Hoja | Contenido |
|---|---|
| Registros | Todos los registros con folio, fecha, hora, usuario, obra, vehículo, material, cantidad |
| Usuarios | Claves, device IDs, roles |
| Obras | Coordenadas y radio de geovalla |
| Proveedores | Catálogo de proveedores |
| Vehiculos | Catálogo de vehículos con placas |
| Materiales | Catálogo de materiales |
| Unidades | Unidades de medida |
