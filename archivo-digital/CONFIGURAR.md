# ARCHIVO DIGITAL — Guía de configuración (100% gratis)

Sistema web tipo "Google Drive" para guardar documentos escaneados en carpetas
(INFORME, SOLICITUD, OFICIOS, MEMORANDUM...) y compartir cada carpeta o documento
con un **código QR**. Funciona en cualquier celular. Costo total: **$0**.

---

## 1) Crear Firebase (el almacenamiento en la nube gratis)

1. Entrá a <https://console.firebase.google.com> con tu cuenta de Google.
2. Click en **Crear proyecto** → poné un nombre (ej: `archivo-digital`) → Continuar → Crear.
3. Cuando se abra el proyecto, tocá el ícono web **`</>`** ("Agregar app" / "Web").
4. Poné un apodo cualquiera (ej: `web`) y tocá **Registrar app**.
5. Te muestra un código con el `firebaseConfig`. **Copiá ese objeto entero** y pegálo
   en el archivo `js/config.js` de este proyecto (reemplazando los campos vacíos).
6. Tocá **Continuar hasta la consola**.

### Activar Firestore (base de datos)
- En el menú izquierdo: **Firestore Database** → **Crear base de datos**.
- Elegí región `us-central1` (o la más cercana) → **Siguiente**.
- Modo: elegí **Modo de producción** (con reglas lo abrimos después) → **Crear**.

### Activar Storage (los archivos)
- En el menú izquierdo: **Storage** → **Comenzar** → región igual que Firestore → **Listo**.

### Abrir acceso (reglas)
1. **Firestore** → pestaña **Reglas** → reemplazá todo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Tocá **Publicar**.

2. **Storage** → pestaña **Reglas** → reemplazá todo por:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

Tocá **Publicar**.

> Estas reglas son "abiertas": cualquiera con el enlace puede ver y subir.
> Si querés protección, poné un PIN en `js/config.js` (opción `APP_PIN`).

---

## 2) Probar en tu PC

- Depende de internet (Firebase + librerías se cargan desde CDN).
- La manera más simple: hacé doble clic en `index.html`. Si no carga, abrí la carpeta
  con un servidor local:
  `npx serve .` (desde la carpeta `archivo-digital`).

Deberías ver las carpetas **INFORME, SOLICITUD, OFICIOS, MEMORANDUM** (se crean solas
la primera vez). Probá subir un archivo, escanear con el celular, editar notas.
Todo se guarda en la nube y otros celulares lo ven al instante.

---

## 3) Publicar en internet GRATIS (GitHub Pages)

1. Creá una cuenta gratis en <https://github.com> si no tenés.
2. Click en el botón **+** (arriba a la derecha) → **New repository**.
   Nombre ej: `archivo-digital`. Dejálo **Public**. Creá el repo.
3. Subí el contenido de la carpeta `archivo-digital` (el `index.html`, `css/`, `js/`).
   Si no sabés usar git, en el repo recién creado tocá **"uploading an existing file"**
   y arrastrá los archivos. O usá git:

```
git init
git add .
git commit -m "Archivo Digital"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/archivo-digital.git
git push -u origin main
```

4. En el repo: **Settings** → **Pages** (barra izquierda).
5. En **Source** elegí `Deploy from a branch` → rama `main`, carpeta `/ (root)` → **Save**.
6. Esperá 1-2 minutos y te da la URL: `https://TU_USUARIO.github.io/archivo-digital/`.

Esa URL es la que van a abrir los QR. **No hace falta cambiar nada del código**:
los enlaces QR se generan solos con esa URL.

---

## 4) Asignación de QR (cómo se "imprimen")

- Abrí la web, entrá a una carpeta o documento.
- Tocá el botón **QR**: se genera el código al instante.
- Pantalla de celular: **capturá la foto del QR** guardada en el celular
  (o tocá "Compartir enlace" por WhatsApp) para que los demás lo abran.
- Para que esté en la oficina: imprimí el QR y pegalo en la mesa de recepción.

---

## Uso diario

- **Subir/Escanear:** botón "Subir / Escanear" → en el celular abre la cámara
  (o elegís un PDF/foto) → elegís la carpeta → nombre → Guardar.
- **Editar:** tocá un documento → "Ver" → botón "Notas / Editar" para escribir
  notas u observaciones que se guardan en la nube.
- **Eliminar/Renombrar:** botones en cada carpeta y documento.
- **Buscar:** barra de búsqueda filtra los documentos de la carpeta actual.

## Solución de problemas

- **Error de CORS al subir** (raro): el bucket de Storage no tiene configurado CORS.
  Instalá Google Cloud CLI y corré:
  `gsutil cors set cors.json gs://TU_BUCKET`
  con un archivo `cors.json` = `[{"origin":["*"],"method":["GET","PUT","POST","DELETE"],"responseHeader":["Content-Type"]}]`
- **No aparece nada:** revisá que el `firebaseConfig` esté completo y que Firestore +
  Storage estén activados.
- **El QR no abre en otro celular:** la web todavía no está publicada; el QR solo
  funciona con la URL de GitHub Pages (o de un dominio propio).