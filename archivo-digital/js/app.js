/* ============================================================
   ARCHIVO DIGITAL
   Guardado compartido de documentos por carpetas + QR.
   ============================================================ */

(function () {
  "use strict";

  var CONFIG = (typeof FIREBASE_CONFIG !== "undefined") ? FIREBASE_CONFIG : null;
  var PIN = (typeof APP_PIN !== "undefined") ? String(APP_PIN) : "";
  var db = null, storage = null;

  var state = {
    folders: {},   // id -> {id, name}
    docs: {},      // id -> doc
    currentFolder: null, // folder id o null (raíz)
    search: "",
    currentFile: null,   // archivo elegido para subir
    currentViewId: null, // doc abierto en el visor
    editingFolder: null,
    pendingDeepDoc: null // doc a abrir de un link QR
  };

  var els = {};
  var uploadTask = null;

  /* Obtiene la base de la URL (funciona en GitHub Pages y en local) */
  function apiBase() {
    var path = location.pathname;
    path = path.substring(0, path.lastIndexOf("/") + 1);
    return location.origin + path;
  }

  function docLink(id)  { return apiBase() + "?v=d:" + id; }
  function folderLink(id) { return apiBase() + "?v=f:" + id; }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    els.toastWrap.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }
  function confirmAction(msg) { return window.confirm(msg); }

  function fmtDate(ts) {
    if (!ts) return "";
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) { return ""; }
  }
  function fmtSize(bytes) {
    if (bytes == null) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
  function safeName(name) {
    return String(name).replace(/[^a-zA-Z0-9.\-_]/g, "_").substring(0, 80);
  }
  function isImage(file) {
    var t = (file && file.type) || (file && file.name) || "";
    return /image\//.test(t) || /\.(png|jpe?g|gif|webp)$/i.test(t);
  }
  function isPdf(doc) {
    var t = (doc && (doc.type || doc.name)) || "";
    return /pdf/i.test(t) || /\.pdf$/i.test(t);
  }

  /* ================= INICIALIZACIÓN ================= */
  function init() {
    els = {
      configScreen: $("configScreen"), pinScreen: $("pinScreen"),
      loadingScreen: $("loadingScreen"), app: $("app"),
      pinInput: $("pinInput"), pinBtn: $("pinBtn"), pinError: $("pinError"),
      searchInput: $("searchInput"), newFolderBtn: $("newFolderBtn"), uploadBtn: $("uploadBtn"),
      breadcrumb: $("breadcrumb"), folderSection: $("folderSection"),
      folderTitle: $("folderTitle"), folderCount: $("folderCount"), folderGrid: $("folderGrid"),
      docsSection: $("docsSection"), docsTitle: $("docsTitle"), docCount: $("docCount"),
      docList: $("docList"), emptyDocs: $("emptyDocs"), toastWrap: $("toastWrap"),
      uploadModal: $("uploadModal"), fileInput: $("fileInput"), dropZone: $("dropZone"),
      previewBox: $("previewBox"), uploadFolder: $("uploadFolder"), uploadName: $("uploadName"),
      uploadProgress: $("uploadProgress"), progressBar: $("progressBar"), progressText: $("progressText"),
      uploadError: $("uploadError"), saveUploadBtn: $("saveUploadBtn"),
      newFolderModal: $("newFolderModal"), folderNameInput: $("folderNameInput"), folderError: $("folderError"),
      createFolderBtn: $("createFolderBtn"),
      renameFolderModal: $("renameFolderModal"), renameFolderInput: $("renameFolderInput"), renameFolderBtn: $("renameFolderBtn"),
      viewerModal: $("viewerModal"), viewerTitle: $("viewerTitle"), viewerBody: $("viewerBody"),
      viewerFrame: $("viewerFrame"), viewerImg: $("viewerImg"), viewerUnsupported: $("viewerUnsupported"),
      openTabBtn: $("openTabBtn"), downloadBtn: $("downloadBtn"), editNotesBtn: $("editNotesBtn"),
      notesBox: $("notesBox"), notesInput: $("notesInput"), saveNotesBtn: $("saveNotesBtn"),
      qrModal: $("qrModal"), qrTitle: $("qrTitle"), qrBox: $("qrBox"), qrLink: $("qrLink"), copyBtn: $("copyBtn")
    };

    /* 1) Verificar configuración */
    if (!CONFIG || !CONFIG.apiKey) { show($("configScreen")); return; }

    /* 2) Pin opcional */
    if (PIN && sessionStorage.getItem("pin_ok") !== PIN) {
      show($("pinScreen"));
      els.pinBtn.addEventListener("click", checkPin);
      els.pinInput.addEventListener("keydown", function (e) { if (e.key === "Enter") checkPin(); });
      return;
    }

    boot();
  }

  function checkPin() {
    if (els.pinInput.value === PIN) {
      sessionStorage.setItem("pin_ok", PIN);
      boot();
    } else {
      els.pinError.classList.remove("hidden");
    }
  }

  function boot() {
    firebase.initializeApp(CONFIG);
    db = firebase.firestore();
    storage = firebase.storage();

    bindEvents();
    parseDeepLink();
    seedDefaultFolders();
    subscribeFolders();
    subscribeDocs();
    autofillFolderSelect();

    show($("app"));
  }

  function show(el) {
    var screens = [els.configScreen, els.pinScreen, els.loadingScreen, els.app];
    screens.forEach(function (s) { if (s) s.classList.add("hidden"); });
    if (el) el.classList.remove("hidden");
  }

  /* ================= CARPETAS POR DEFECTO ================= */
  function seedDefaultFolders() {
    db.collection("_meta").doc("seed").get().then(function (snap) {
      if (snap.exists) return;
      var batch = db.batch();
      ["INFORME", "SOLICITUD", "OFICIOS", "MEMORANDUM"].forEach(function (name) {
        batch.set(db.collection("folders").doc(), {
          name: name,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      batch.set(db.collection("_meta").doc("seed"), { done: true });
      batch.commit();
    }).catch(function (e) { console.warn(e); });
  }

  /* ================= SUSCRIPCIONES EN TIEMPO REAL ================= */
  function subscribeFolders() {
    db.collection("folders").orderBy("name").onSnapshot(function (snap) {
      state.folders = {};
      snap.forEach(function (d) {
        var data = d.data();
        state.folders[d.id] = { id: d.id, name: data.name || "Sin nombre" };
      });
      renderRoot();
    }, function (e) { console.warn("folders:", e); });
  }

  function subscribeDocs() {
    db.collection("docs").onSnapshot(function (snap) {
      state.docs = {};
      snap.forEach(function (d) {
        var data = d.data();
        state.docs[d.id] = {
          id: d.id,
          name: data.name || "Sin nombre",
          folderId: data.folderId || null,
          url: data.url || "",
          path: data.path || "",
          size: data.size || 0,
          type: data.type || "",
          createdAt: data.createdAt || null,
          views: data.views || 0,
          notas: data.notas || ""
        };
      });
      renderRoot();
      renderDocs();
    }, function (e) { console.warn("docs:", e); });
  }

  /* ================= ENLACES Q ================= */
  function parseDeepLink() {
    var params = new URLSearchParams(location.search);
    var v = params.get("v");
    if (!v) return;
    var parts = v.split(":");
    if (parts[0] === "f") {
      openFolder(parts[1]);
    } else if (parts[0] === "d") {
      var doc = state.docs[parts[1]];
      if (doc && doc.folderId) {
        openFolder(doc.folderId);
        state.pendingDeepDoc = parts[1];
      } else {
        state.pendingDeepDoc = parts[1];
      }
    }
  }

  function tryOpenPendingDoc() {
    if (!state.pendingDeepDoc) return;
    var id = state.pendingDeepDoc;
    var doc = state.docs[id];
    if (!doc) return;
    state.pendingDeepDoc = null;
    if (state.currentFolder !== doc.folderId) { openFolder(doc.folderId); }
    openViewer(id);
  }

  /* ================= RENDERIZADO ================= */
  function renderRoot() {
    var folderCount = Object.keys(state.folders).length;
    els.folderCount.textContent = folderCount + (folderCount === 1 ? " carpeta" : " carpetas");
    els.folderTitle.textContent = "Carpetas";
    els.folderGrid.innerHTML = "";
    Object.keys(state.folders).forEach(function (id) {
      els.folderGrid.appendChild(folderCard(state.folders[id]));
    });
    autofillFolderSelect();
  }

  function folderCard(folder) {
    var count = 0;
    Object.keys(state.docs).forEach(function (id) {
      if (state.docs[id].folderId === folder.id) count++;
    });

    var card = document.createElement("div");
    card.className = "folder-card";
    card.innerHTML =
      '<div class="folder-icon">' + esc(folder.name[0]) + '</div>' +
      '<div class="folder-info">' +
        '<div class="folder-name">' + esc(folder.name) + '</div>' +
        '<div class="muted">' + count + (count === 1 ? " documento" : " documentos") + '</div>' +
      '</div>' +
      '<div class="folder-actions">' +
        '<button class="mini-btn" data-qr data-id="' + folder.id + '" title="Compartir QR">QR</button>' +
        '<button class="mini-btn" data-rename data-id="' + folder.id + '" title="Renombrar">Renombrar</button>' +
        '<button class="mini-btn danger" data-del data-id="' + folder.id + '" title="Eliminar">Eliminar</button>' +
      '</div>';

    card.querySelector(".folder-info").addEventListener("click", function () { openFolder(folder.id); });
    card.querySelector("[data-qr]").addEventListener("click", function () { openQr("f:" + folder.id, "Carpeta: " + folder.name); });
    card.querySelector("[data-rename]").addEventListener("click", function () { openRenameFolder(folder.id); });
    card.querySelector("[data-del]").addEventListener("click", function () { deleteFolder(folder.id); });
    return card;
  }

  function renderDocs() {
    var folderId = state.currentFolder;
    var isRoot = !folderId;
    els.docsSection.classList.toggle("hidden", isRoot);
    els.folderSection.classList.toggle("hidden", !isRoot);

    renderBreadcrumb();

    if (isRoot) { tryOpenPendingDoc(); return; }

    var folderName = state.folders[folderId] ? state.folders[folderId].name : "";
    els.docsTitle.textContent = folderName;
    els.docList.innerHTML = "";

    var q = (state.search || "").toLowerCase();
    var list = Object.keys(state.docs).map(function (id) { return state.docs[id]; })
      .filter(function (d) { return d.folderId === folderId; })
      .filter(function (d) { return !q || d.name.toLowerCase().indexOf(q) > -1; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    els.docCount.textContent = list.length + (list.length === 1 ? " documento" : " documentos");
    els.emptyDocs.classList.toggle("hidden", list.length > 0);

    list.forEach(function (d) { els.docList.appendChild(docRow(d)); });

    renderBreadcrumb();
    tryOpenPendingDoc();
  }

  function badge(doc) {
    if (isPdf(doc)) return "PDF";
    if (isImage(doc)) return "IMG";
    var t = String(doc.type || "").replace("image/", "").replace("application/", "");
    return (t || "DOC").substring(0, 6).toUpperCase();
  }

  function docRow(doc) {
    var row = document.createElement("div");
    row.className = "doc-row";
    row.setAttribute("data-id", doc.id);
    row.innerHTML =
      '<span class="badge">' + badge(doc) + '</span>' +
      '<div class="doc-info">' +
        '<div class="doc-name">' + esc(doc.name) + '</div>' +
        '<div class="muted">' + fmtDate(doc.createdAt) + (doc.size ? " · " + fmtSize(doc.size) : "") + (doc.views ? " · " + doc.views + " vistas" : "") + '</div>' +
        (doc.notas ? '<div class="doc-notes-prev">' + esc(doc.notas) + '</div>' : '') +
      '</div>' +
      '<div class="doc-actions">' +
        '<button class="mini-btn" data-view data-id="' + doc.id + '">Ver</button>' +
        '<button class="mini-btn" data-qr data-id="' + doc.id + '">QR</button>' +
        '<button class="mini-btn" data-notes data-id="' + doc.id + '">Notas</button>' +
        '<button class="mini-btn danger" data-del data-id="' + doc.id + '" title="Eliminar">Eliminar</button>' +
      '</div>';

    row.querySelector("[data-view]").addEventListener("click", function () { openViewer(doc.id); });
    row.querySelector("[data-qr]").addEventListener("click", function () { openQr("d:" + doc.id, "Documento: " + doc.name); });
    row.querySelector("[data-notes]").addEventListener("click", function () { openViewer(doc.id); setTimeout(function () { toggleNotes(true); }, 250); });
    row.querySelector("[data-del]").addEventListener("click", function () { deleteDoc(doc.id); });
    row.querySelector(".doc-name").addEventListener("click", function () { openViewer(doc.id); });
    return row;
  }

  function renderBreadcrumb() {
    els.breadcrumb.innerHTML = "";
    var home = document.createElement("button");
    home.className = "crumb-btn";
    home.textContent = "Inicio";
    home.addEventListener("click", function () { openRoot(); });
    els.breadcrumb.appendChild(home);

    var folderId = state.currentFolder;
    if (folderId && state.folders[folderId]) {
      var sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.textContent = " / ";
      var cur = document.createElement("span");
      cur.className = "crumb-current";
      cur.textContent = state.folders[folderId].name;
      els.breadcrumb.appendChild(sep);
      els.breadcrumb.appendChild(cur);
    }
  }

  /* ================= NAVEGACIÓN ================= */
  function openRoot() {
    state.currentFolder = null;
    state.search = "";
    els.searchInput.value = "";
    renderDocs();
    renderBreadcrumb();
  }
  function openFolder(id) {
    state.currentFolder = id;
    renderDocs();
    window.scrollTo(0, 0);
  }

  /* ================= CARPETAS: CRUD ================= */
  function openNewFolder() {
    els.folderNameInput.value = "";
    els.folderError.classList.add("hidden");
    els.newFolderModal.classList.remove("hidden");
    setTimeout(function () { els.folderNameInput.focus(); }, 50);
  }
  function createFolder() {
    var name = els.folderNameInput.value.trim();
    if (!name) { els.folderError.textContent = "Poné un nombre."; els.folderError.classList.remove("hidden"); return; }
    db.collection("folders").add({
      name: name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      els.newFolderModal.classList.add("hidden");
      toast("Carpeta creada.");
    }).catch(function (e) { els.folderError.textContent = "Error: " + e.message; els.folderError.classList.remove("hidden"); });
  }

  function openRenameFolder(id) {
    state.editingFolder = id;
    var f = state.folders[id];
    els.renameFolderInput.value = f ? f.name : "";
    els.renameFolderModal.classList.remove("hidden");
    setTimeout(function () { els.renameFolderInput.focus(); els.renameFolderInput.select(); }, 50);
  }
  function saveRenameFolder() {
    var id = state.editingFolder;
    var name = els.renameFolderInput.value.trim();
    if (!id || !name) { toast("El nombre no puede quedar vacío."); return; }
    db.collection("folders").doc(id).update({ name: name })
      .then(function () { els.renameFolderModal.classList.add("hidden"); toast("Carpeta renombrada."); })
      .catch(function (e) { toast("Error: " + e.message); });
  }

  function deleteFolder(id) {
    var f = state.folders[id];
    var count = 0;
    Object.keys(state.docs).forEach(function (did) { if (state.docs[did].folderId === id) count++; });
    var msg = "Eliminar la carpeta " + (f ? f.name : "") + "?";
    if (count > 0) msg += " Se borrarán también sus " + count + " documento(s), incluyendo los archivos de la nube.";
    if (!confirmAction(msg)) return;

    db.collection("docs").where("folderId", "==", id).get().then(function (snap) {
      var ops = [];
      snap.forEach(function (d) {
        var data = d.data();
        ops.push(db.collection("docs").doc(d.id).delete());
        if (data.path) ops.push(storage.ref(data.path).delete().catch(function () {}));
      });
      ops.push(db.collection("folders").doc(id).delete());
      return Promise.all(ops);
    }).then(function () {
      if (state.currentFolder === id) openRoot();
      toast("Carpeta eliminada.");
    }).catch(function (e) { toast("Error: " + e.message); });
  }

  /* ================= SUBIR / ESCANEAR ================= */
  function autofillFolderSelect() {
    var prev = els.uploadFolder.value;
    els.uploadFolder.innerHTML = "";
    Object.keys(state.folders).forEach(function (id) {
      var opt = document.createElement("option");
      opt.value = id;
      opt.textContent = state.folders[id].name;
      els.uploadFolder.appendChild(opt);
    });
    var exists = false;
    for (var i = 0; i < els.uploadFolder.options.length; i++) {
      if (els.uploadFolder.options[i].value === prev) { exists = true; break; }
    }
    if (exists) els.uploadFolder.value = prev;
    else if (state.currentFolder) els.uploadFolder.value = state.currentFolder;
    else if (els.uploadFolder.options.length) els.uploadFolder.value = els.uploadFolder.options[0].value;
  }

  function openUpload() {
    autofillFolderSelect();
    els.fileInput.value = "";
    els.uploadName.value = "";
    els.previewBox.classList.add("hidden");
    els.previewBox.innerHTML = "";
    els.uploadProgress.classList.add("hidden");
    els.uploadError.classList.add("hidden");
    els.saveUploadBtn.disabled = false;
    els.uploadModal.classList.remove("hidden");
    els.fileInput.click();
  }

  function onFileChosen() {
    var file = els.fileInput.files[0];
    if (!file) return;
    state.currentFile = file;
    els.uploadName.value = file.name.replace(/\.[^.]+$/, "");
    els.previewBox.innerHTML = "";
    els.previewBox.classList.remove("hidden");

    if (isImage(file)) {
      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = "Vista previa";
      els.previewBox.appendChild(img);
    } else {
      var span = document.createElement("span");
      span.textContent = file.name + " (" + fmtSize(file.size) + ")";
      els.previewBox.appendChild(span);
    }
  }

  function saveUpload() {
    var file = state.currentFile;
    if (!file) { els.uploadError.textContent = "Elegí un archivo primero."; els.uploadError.classList.remove("hidden"); return; }
    var folderId = els.uploadFolder.value;
    if (!folderId) { els.uploadError.textContent = "Elegí la carpeta de destino."; els.uploadError.classList.remove("hidden"); return; }
    var name = els.uploadName.value.trim() || file.name;

    els.uploadError.classList.add("hidden");
    els.uploadProgress.classList.remove("hidden");
    els.saveUploadBtn.disabled = true;

    var path = "documentos/" + folderId + "/" + Date.now() + "_" + safeName(file.name);
    uploadTask = storage.ref(path).put(file);

    uploadTask.on("state_changed",
      function (snap) {
        var pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        els.progressBar.style.width = pct + "%";
        els.progressText.textContent = pct + "%";
      },
      function (err) {
        els.uploadProgress.classList.add("hidden");
        els.saveUploadBtn.disabled = false;
        els.uploadError.textContent = "Error al subir: " + err.message;
        els.uploadError.classList.remove("hidden");
      },
      function () {
        uploadTask.snapshot.ref.getDownloadURL().then(function (url) {
          return db.collection("docs").add({
            name: name,
            folderId: folderId,
            url: url,
            path: path,
            size: file.size,
            type: file.type || "",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            views: 0,
            notas: ""
          });
        }).then(function () {
          els.uploadModal.classList.add("hidden");
          toast("Documento guardado.");
        }).catch(function (e) {
          els.uploadProgress.classList.add("hidden");
          els.saveUploadBtn.disabled = false;
          els.uploadError.textContent = "Error al guardar: " + e.message;
          els.uploadError.classList.remove("hidden");
        });
      }
    );
  }

  /* ================= VISOR / NOTAS ================= */
  function openViewer(id) {
    var doc = state.docs[id];
    if (!doc) { toast("Documento no encontrado."); return; }
    if (state.currentViewId === id && !els.viewerModal.classList.contains("hidden")) return;
    state.currentViewId = id;

    db.collection("docs").doc(id).update({
      views: firebase.firestore.FieldValue.increment(1)
    }).catch(function () {});

    els.viewerTitle.textContent = doc.name;
    els.viewerFrame.classList.add("hidden");
    els.viewerImg.classList.add("hidden");
    els.viewerUnsupported.classList.add("hidden");
    els.notesBox.classList.add("hidden");
    els.notesInput.value = doc.notas || "";

    if (isPdf(doc)) {
      els.viewerFrame.src = doc.url;
      els.viewerFrame.classList.remove("hidden");
    } else if (isImage(doc)) {
      els.viewerImg.src = doc.url;
      els.viewerImg.classList.remove("hidden");
    } else {
      els.viewerUnsupported.classList.remove("hidden");
    }
    els.viewerModal.classList.remove("hidden");
  }

  function toggleNotes(open) {
    els.notesBox.classList.toggle("hidden", !open);
    if (open) els.notesInput.focus();
  }

  function saveNotes() {
    var id = state.currentViewId;
    var n = els.notesInput.value;
    db.collection("docs").doc(id).update({ notas: n })
      .then(function () { toast("Notas guardadas."); })
      .catch(function (e) { toast("Error: " + e.message); });
  }

  function deleteDoc(id) {
    var doc = state.docs[id];
    if (!doc) return;
    if (!confirmAction("Eliminar el documento \"" + doc.name + "\"?")) return;
    var ops = [db.collection("docs").doc(id).delete()];
    if (doc.path) ops.push(storage.ref(doc.path).delete().catch(function () {}));
    Promise.all(ops).then(function () { toast("Documento eliminado."); })
      .catch(function (e) { toast("Error: " + e.message); });
  }

  /* ================= QR ================= */
  function openQr(kindId, title) {
    var parts = kindId.split(":");
    var link = parts[0] === "f" ? folderLink(parts[1]) : docLink(parts[1]);
    els.qrTitle.textContent = title || "Compartir";
    els.qrLink.value = link;
    els.qrBox.innerHTML = "";
    try {
      new QRCode(els.qrBox, {
        text: link,
        width: 240,
        height: 240,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      els.qrBox.innerHTML = '<p class="muted">No se pudo generar el QR (revisá la conexión a internet).</p>';
    }
    els.qrModal.classList.remove("hidden");
  }

  /* ================= EVENTOS ================= */
  function bindEvents() {
    els.newFolderBtn.addEventListener("click", openNewFolder);
    els.createFolderBtn.addEventListener("click", createFolder);
    els.folderNameInput.addEventListener("keydown", function (e) { if (e.key === "Enter") createFolder(); });

    els.renameFolderBtn.addEventListener("click", saveRenameFolder);
    els.renameFolderInput.addEventListener("keydown", function (e) { if (e.key === "Enter") saveRenameFolder(); });

    els.uploadBtn.addEventListener("click", openUpload);
    els.fileInput.addEventListener("change", onFileChosen);
    els.dropZone.addEventListener("click", function () { els.fileInput.click(); });
    els.saveUploadBtn.addEventListener("click", saveUpload);

    els.searchInput.addEventListener("input", function () {
      state.search = els.searchInput.value.trim();
      renderDocs();
    });

    els.openTabBtn.addEventListener("click", function () {
      var doc = state.docs[state.currentViewId];
      if (doc && doc.url) window.open(doc.url, "_blank");
    });
    els.downloadBtn.addEventListener("click", function () {
      var doc = state.docs[state.currentViewId];
      if (doc && doc.url) {
        var a = document.createElement("a");
        a.href = doc.url;
        a.download = doc.name;
        a.click();
      }
    });
    els.editNotesBtn.addEventListener("click", function () { toggleNotes(); });
    els.notesBox.querySelector("#saveNotesBtn").addEventListener("click", saveNotes);

    els.copyBtn.addEventListener("click", function () {
      var text = els.qrLink.value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("Enlace copiado."); });
      } else {
        els.qrLink.select();
        document.execCommand("copy");
        toast("Enlace copiado.");
      }
    });

    document.querySelectorAll(".modal-close").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $(btn.getAttribute("data-close")).classList.add("hidden");
        if (uploadTask) { /* no cancelamos subidas ya empezadas */ }
      });
    });
    document.querySelectorAll(".modal-overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) {
        if (e.target === ov) ov.classList.add("hidden");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();