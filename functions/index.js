const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Busboy = require("busboy");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();

const db = admin.firestore();
const backupDb = getFirestore(admin.app(), "revert-saldos");
const FieldValue = admin.firestore.FieldValue;
const FieldPath = admin.firestore.FieldPath;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_SCHEMA = process.env.SUPABASE_SCHEMA || "api";

function assertSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Supabase no esta configurado en el backend.");
    error.statusCode = 500;
    error.errorCode = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }
}

async function supabaseRequest(path, options = {}) {
  assertSupabaseConfigured();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Accept-Profile": SUPABASE_SCHEMA,
      "Content-Profile": SUPABASE_SCHEMA,
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    data = text || null;
  }

  if (!res.ok) {
    const error = new Error(`Supabase error ${res.status}: ${text}`);
    error.statusCode = 500;
    error.errorCode = "SUPABASE_REQUEST_FAILED";
    throw error;
  }

  return data;
}

function supabaseEq(value) {
  return encodeURIComponent(String(value || ""));
}

async function getSupabaseAsesorByUid(uid) {
  const rows = await supabaseRequest(
    `asesores?firebase_uid=eq.${supabaseEq(uid)}&select=*&limit=1`
  );

  return rows?.[0] || null;
}

function mapSupabaseSolicitud(row) {
  return {
    id: row.firebase_id || row.id,
    asesor_uid: row.firebase_uid,
    nombre_asesor: row.email || "",
    tipo: row.tipo || "",
    costo: Number(row.costo || 0),
    estatus: row.estatus || "",
    finalizado: row.finalizado === true,
    reembolsado: row.reembolsado === true,
    monto_reembolsado: Number(row.monto_reembolsado || 0),
    curp: row.curp || "",
    nss: row.nss || "",
    archivoFinal: row.archivo_final || "",
    fecha: row.fecha || row.created_at || null,
    detalles_extra: row.detalles_extra || {},
    cuestionario: row.cuestionario || {},
    descargado_cliente: row.raw_data?.descargado_cliente === true
  };
}

function mapSupabaseChat(row) {
  return {
    id: row.firebase_id || row.id,
    asesor_uid: row.firebase_uid,
    remitente: row.remitente || row.email || "",
    texto: row.texto || "",
    respondido: row.respondido === true,
    timestamp: row.fecha || row.created_at || null
  };
}

async function insertSupabaseMovimientoSaldo(row) {
  try {
    await supabaseRequest("movimientos_saldo", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify([row])
    });
  } catch (error) {
    console.warn("No se pudo registrar movimiento de saldo en Supabase", {
      error: error.message,
      firebase_uid: row.firebase_uid,
      referencia_id: row.referencia_id
    });
  }
}

const BLOCKED_IPS = new Set([
  "2001:67c:2628:647:37:1300:0:86"
]);

app.use((req, res, next) => {
  const ip = getRequestIp(req);

  if (ip && BLOCKED_IPS.has(ip)) {
    return res.status(403).json({
      success: false,
      error_code: "IP_BLOCKED",
      message: "Acceso bloqueado por seguridad."
    });
  }

  return next();
});

const N8N_WEBHOOK_URL = "https://n8n.srv1567730.hstgr.cloud/webhook/Nueva_acta";

const SERVICE_MAP = {
  SEMANAS_COTIZADAS: "SEMANAS COTIZADAS",
  SEMANAS_DETALLADAS: "SEMANAS DETALLADAS",

  SINDO_ULTIMO_RETIRO: "SINDO ULTIMO RETIRO",
  SINDO_ALFANUMERICO: "SINDO ALFANUMÉRICO",
  SINDO_SALARIO_PROMEDIO: "SINDO SALARIO PROMEDIO",
  SINDO_VIGENCIA: "SINDO VIGENCIA",
  SINDO_COMPLETO: "SINDO COMPLETO",

  TARJETA_NSS: "Tarjeta NSS",
  VIGENCIA_DERECHOS: "Vigencia de Derechos",
  INCAPACIDAD: "Incapacidad",
  RECETAS: "Recetas",
  INSCRIPCION_MODALIDAD_10: "Inscripción Modalidad 10",
  ALTA_MENSUAL: "Alta Mensual",
  ALTA_DESEMPLEO_LINEA_CAPTURA: "Alta Para Desempleo con linea de captura",
  ALTA_DESEMPLEO_APORTACIONES: "Alta para Desempleo con aportaciones",

  RFC_CLON: "RFC Clon",
  RFC_VERIFICABLE: "RFC Verificable",
  RFC_IDCIF: "RFC con IDCIF",
  RFC_ORIGINAL: "RFC Original",
  LOCALIZACION_IDCIF: "Localización de IDcif",

  BURO_CREDITO: "Buró de Crédito",
  CURP: "CURP",
  RECIBO_CFE: "Recibo CFE",
  ACTA_NACIMIENTO: "Acta de Nacimiento",
  ACTA_MATRIMONIO: "Acta de Matrimonio",
  ACTA_DIVORCIO: "Acta de Divorcio",
  ACTA_DEFUNCION: "Acta de Defunción",

  LOCALIZACION_CONTRASENA_INFONAVIT: "Localización de Contraseña",
  RESETEO_INFONAVIT: "Reseteo Cuenta",
  PRECALIFICACION_MEJORAVIT: "Precalificación Mejoravit",
  PRECALIFICACION_LINEA_II: "Precalificación Linea II",
  CREAR_CUENTA_INFONAVIT: "CREAR CUENTA EN MI CUENTAINFONAVIT",
  HISTORICO_INFONAVIT: "Histórico Infonavit",

  REGISTRO_AFORE_DISTANCIA: "Registro a Distancia",
  RETIRO_DESEMPLEO_AFORE: "Retiro Desempleo a Distancia",
  CAMBIO_CONTRASENA_AFORE: "Cambiar Contraseña AFORE Web",
  ESTADO_CUENTA_AFORE_AZTECA: "Estado de cuenta AFORE - Azteca",
  ESTADO_CUENTA_AFORE_COPPEL: "Estado de cuenta AFORE - Coppel",
  ESTADO_CUENTA_AFORE_PROFUTURO: "Estado de cuenta AFORE - Profuturo",
  ESTADO_CUENTA_AFORE_INVERCAP: "Estado de cuenta AFORE - Invercap",
  ESTADO_CUENTA_AFORE_SURA: "Estado de cuenta AFORE - Sura",
  ESTADO_CUENTA_AFORE_BANORTE: "Estado de cuenta AFORE - Banorte",
  ESTADO_CUENTA_AFORE_PRINCIPAL: "Estado de cuenta AFORE - Principal",
  ESTADO_CUENTA_AFORE_BANAMEX: "Estado de cuenta AFORE - Banamex",

  ANALISIS_RAPIDO_PENSION: "Análisis rápido de pensión",
  ANALISIS_DETALLADO_PENSION: "Análisis Detallado de pensión",

  // Alias legacy temporales para no romper integraciones anteriores.
  VIGENCIA: "Vigencia de Derechos",
  ALTA_DESEMPLEO: "Alta para Desempleo con aportaciones",
  RETIRO: "Retiro Desempleo a Distancia",
  CONTRASENA: "Cambiar Contraseña AFORE Web",
  REGISTRO: "Registro a Distancia"
};

const LEGACY_SERVICE_NAMES = {
  SEMANAS_COTIZADAS: ["SEMANAS"],
  SINDO_ULTIMO_RETIRO: ["SINDO ULT RET"],
  SINDO_ALFANUMERICO: ["SINDO ALFANUMERICO"],
  TARJETA_NSS: ["TARJETA NSS"],
  VIGENCIA_DERECHOS: ["VIGENCIA DERECHOS"],
  INSCRIPCION_MODALIDAD_10: ["INSCRIPCION MODALIDAD 10"],
  ALTA_MENSUAL: ["ALTA MENSUAL"],
  ALTA_DESEMPLEO_LINEA_CAPTURA: ["ALTA DESEMPLEO LINEA CAPTURA"],
  ALTA_DESEMPLEO_APORTACIONES: ["ALTA DESEMPLEO APORTACIONES"],
  RFC_CLON: ["CLON RFC"],
  RFC_VERIFICABLE: ["RFC VER"],
  RFC_IDCIF: ["RFC IDCIF"],
  RFC_ORIGINAL: ["RFC ORIGINAL"],
  LOCALIZACION_IDCIF: ["LOCALIZACION IDCIF"],
  BURO_CREDITO: ["DPR BURÓ DE CREDITO"],
  ACTA_NACIMIENTO: ["ACTA"],
  ACTA_MATRIMONIO: ["ACTA MATRIMONIO"],
  ACTA_DIVORCIO: ["ACTA DIVORCIO"],
  ACTA_DEFUNCION: ["ACTA DEFUNCION"],
  LOCALIZACION_CONTRASENA_INFONAVIT: ["LOCALIZACION CONTRASENA INFONAVIT"],
  RESETEO_INFONAVIT: ["RESETEO INFONAVIT"],
  PRECALIFICACION_MEJORAVIT: ["PRECALIFICACION MEJORAVIT"],
  PRECALIFICACION_LINEA_II: ["PRECALIFICACION LINEA II"],
  CREAR_CUENTA_INFONAVIT: ["CREAR CUENTA INFONAVIT"],
  HISTORICO_INFONAVIT: ["HISTORICO INFONAVIT"],
  REGISTRO_AFORE_DISTANCIA: ["REGISTRO AFORE DISTANCIA"],
  RETIRO_DESEMPLEO_AFORE: ["RETIRO DESEMPLEO AFORE"],
  CAMBIO_CONTRASENA_AFORE: ["CAMBIO CONTRASENA AFORE"],
  ESTADO_CUENTA_AFORE_AZTECA: ["ESTADO CUENTA AFORE AZTECA"],
  ESTADO_CUENTA_AFORE_COPPEL: ["ESTADO CUENTA AFORE COPPEL"],
  ESTADO_CUENTA_AFORE_PROFUTURO: ["ESTADO CUENTA AFORE PROFUTURO"],
  ESTADO_CUENTA_AFORE_INVERCAP: ["ESTADO CUENTA AFORE INVERCAP"],
  ESTADO_CUENTA_AFORE_SURA: ["ESTADO CUENTA AFORE SURA"],
  ESTADO_CUENTA_AFORE_BANORTE: ["ESTADO CUENTA AFORE BANORTE"],
  ESTADO_CUENTA_AFORE_PRINCIPAL: ["ESTADO CUENTA AFORE PRINCIPAL"],
  ESTADO_CUENTA_AFORE_BANAMEX: ["ESTADO CUENTA AFORE BANAMEX"],
  ANALISIS_RAPIDO_PENSION: ["ANALISIS RAPIDO PENSION"],
  ANALISIS_DETALLADO_PENSION: ["ANALISIS DETALLADO PENSION"],
  VIGENCIA: ["VIGENCIA DERECHOS"],
  ALTA_DESEMPLEO: ["ALTA DESEMPLEO APORTACIONES"],
  RETIRO: ["RETIRO DESEMPLEO AFORE"],
  CONTRASENA: ["CAMBIO CONTRASENA AFORE"],
  REGISTRO: ["REGISTRO AFORE DISTANCIA"]
};

const EXTRA_DEFAULTS = {
  referencia_externa: "N/A",
  nombre_cliente: "N/A",
  rfc: "N/A",
  idcif: "N/A",
  pass: "N/A",
  pass_nueva: "N/A",
  num_servicio: "N/A",
  fecha: "N/A",
  turno: "N/A",
  delegacion: "N/A",
  clinica: "N/A",
  consultorio: "N/A",
  patron: "N/A",
  puesto: "N/A",
  dias_incapacidad: "N/A",
  telefono: "N/A",
  telefono_contacto: "N/A",
  correo: "N/A",
  nota: "N/A"
};

const DASHBOARD_SERVICE_PRICES = {
  "SEMANAS COTIZADAS": 15,
  "SEMANAS DETALLADAS": 25,
  "SINDO ULTIMO RETIRO": 45,
  "SINDO ALFANUMERICO": 55,
  "SINDO COMPLETO": 190,
  "SINDO SALARIO PROMEDIO": 95,
  "SINDO VIGENCIA": 95,
  "TARJETA NSS": 15,
  "VIGENCIA DE DERECHOS": 15,
  "INCAPACIDAD": 20,
  "RECETAS": 20,
  "INSCRIPCION MODALIDAD 10": 200,
  "ALTA MENSUAL": 670,
  "ALTA PARA DESEMPLEO CON LINEA DE CAPTURA": 200,
  "ALTA PARA DESEMPLEO CON APORTACIONES": 650,
  "RFC CLON": 25,
  "RFC VERIFICABLE": 95,
  "RFC CON IDCIF": 20,
  "RFC ORIGINAL": 180,
  "LOCALIZACION DE IDCIF": 60,
  "BURO DE CREDITO": 170,
  "CURP": 4,
  "RECIBO CFE": 10,
  "ACTA DE NACIMIENTO": 11,
  "ACTA DE MATRIMONIO": 11,
  "ACTA DE DIVORCIO": 11,
  "ACTA DE DEFUNCION": 11,
  "CERTIFICADO INEA": 30,
  "CERTIFICADO COVID": 20,
  "LOCALIZACION DE CONTRASENA": 90,
  "RESETEO CUENTA": 90,
  "PRECALIFICACION MEJORAVIT": 50,
  "PRECALIFICACION LINEA II": 80,
  "CREAR CUENTA EN MI CUENTAINFONAVIT": 100,
  "HISTORICO INFONAVIT": 100,
  "REGISTRO A DISTANCIA": 90,
  "RETIRO DESEMPLEO A DISTANCIA": 60,
  "CAMBIAR CONTRASENA AFORE WEB": 30,
  "ESTADO DE CUENTA AFORE": 500,
  "ANALISIS RAPIDO DE PENSION": 200,
  "ANALISIS DETALLADO DE PENSION": 3000,
  "AZTECA": 500,
  "COPPEL": 500,
  "INVERCAP": 1400,
  "SURA": 800,
  "BANORTE": 500,
  "PRINCIPAL": 500,
  "BANAMEX": 1200
};

function normalizeString(value) {
  return String(value || "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createApiKey() {
  const raw = crypto.randomBytes(32).toString("base64url");
  return `dpr_live_${raw}`;
}

function getKeyPrefix(apiKey) {
  return String(apiKey || "").slice(0, 18);
}

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    null
  );
}

async function writeUsageLog(data) {
  try {
    await db.collection("api_usage_logs").add({
      ...data,
      created_at: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("api_usage_logs error:", error);
  }
}

async function authenticateApiKey(req, requiredPermission) {
  if (process.env.DPR_B2B_ENABLED !== "true") {
    const error = new Error("API B2B deshabilitada temporalmente por seguridad.");
    error.statusCode = 503;
    error.errorCode = "B2B_DISABLED";
    throw error;
  }

  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "");

  if (!apiKey) {
    const error = new Error("Falta API Key.");
    error.statusCode = 401;
    error.errorCode = "API_KEY_REQUIRED";
    throw error;
  }

  const keyHash = sha256(apiKey);

  const snap = await db
    .collection("api_keys")
    .where("key_hash", "==", keyHash)
    .limit(1)
    .get();

  if (snap.empty) {
    const error = new Error("API Key inválida o inactiva.");
    error.statusCode = 401;
    error.errorCode = "INVALID_API_KEY";
    throw error;
  }

  const apiKeyDoc = snap.docs[0];
  const apiKeyData = apiKeyDoc.data();

  if (apiKeyData.estatus !== "activa") {
    const error = new Error("API Key inválida o inactiva.");
    error.statusCode = 401;
    error.errorCode = "INACTIVE_API_KEY";
    throw error;
  }

  const permisos = Array.isArray(apiKeyData.permisos) ? apiKeyData.permisos : [];

  if (requiredPermission && !permisos.includes(requiredPermission)) {
    const error = new Error("La API Key no tiene permiso para esta operación.");
    error.statusCode = 403;
    error.errorCode = "PERMISSION_DENIED";
    throw error;
  }

  const asesorUid = apiKeyData.asesor_uid;

  if (!asesorUid) {
    const error = new Error("La API Key no tiene asesor_uid asociado.");
    error.statusCode = 500;
    error.errorCode = "API_KEY_WITHOUT_ASESOR";
    throw error;
  }

  const asesorRef = db.collection("asesores").doc(asesorUid);
  const asesorSnap = await asesorRef.get();

  if (!asesorSnap.exists) {
    const error = new Error("El asesor asociado a la API Key no existe.");
    error.statusCode = 404;
    error.errorCode = "ASESOR_NOT_FOUND";
    throw error;
  }

  await apiKeyDoc.ref.update({
    last_used_at: FieldValue.serverTimestamp()
  });

  return {
    apiKeyId: apiKeyDoc.id,
    apiKeyPrefix: apiKeyData.key_prefix || getKeyPrefix(apiKey),
    apiKeyData,
    asesorRef,
    asesor: {
      id: asesorSnap.id,
      ...asesorSnap.data()
    }
  };
}

async function authenticateFirebaseUser(req) {
  const authHeader = req.headers["authorization"] || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    const error = new Error("Falta token de sesión.");
    error.statusCode = 401;
    error.errorCode = "FIREBASE_TOKEN_REQUIRED";
    throw error;
  }

  let decoded = null;

  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    const authError = new Error("Token de sesión inválido.");
    authError.statusCode = 401;
    authError.errorCode = "INVALID_FIREBASE_TOKEN";
    throw authError;
  }

  const asesorUid = decoded.uid;
  const asesorRef = db.collection("asesores").doc(asesorUid);
  const asesorSnap = await asesorRef.get();

  if (!asesorSnap.exists) {
    const error = new Error("No existe el asesor autenticado.");
    error.statusCode = 404;
    error.errorCode = "ASESOR_NOT_FOUND";
    throw error;
  }

  return {
    uid: asesorUid,
    email: decoded.email || "",
    asesorRef,
    asesor: {
      id: asesorSnap.id,
      ...asesorSnap.data()
    }
  };
}

async function authenticateDashboardUser(req) {
  const authHeader = req.headers["authorization"] || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    const error = new Error("Falta token de sesion.");
    error.statusCode = 401;
    error.errorCode = "FIREBASE_TOKEN_REQUIRED";
    throw error;
  }

  let decoded = null;

  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    const authError = new Error("Token de sesion invalido.");
    authError.statusCode = 401;
    authError.errorCode = "INVALID_FIREBASE_TOKEN";
    throw authError;
  }

  const asesorUid = decoded.uid;
  const email = decoded.email || "";
  const displayName = decoded.name || (email ? email.split("@")[0] : "Usuario");

  let asesor = await getSupabaseAsesorByUid(asesorUid);

  if (!asesor) {
    const inserted = await supabaseRequest("asesores?on_conflict=firebase_uid", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([{
        firebase_uid: asesorUid,
        email: email || `${asesorUid}@sin-correo.local`,
        nombre: displayName,
        role: "user",
        activo: true,
        saldo_actual: 0,
        raw_data: {
          creado_desde: "dashboard_backend",
          firebase_uid: asesorUid,
          email
        }
      }])
    });
    asesor = inserted?.[0] || await getSupabaseAsesorByUid(asesorUid);
  }

  if (asesor.activo === false || asesor.inhabilitado === true) {
    const error = new Error("Tu cuenta se encuentra inhabilitada. Contacta a soporte.");
    error.statusCode = 403;
    error.errorCode = "ASESOR_DISABLED";
    throw error;
  }

  return {
    uid: asesorUid,
    email,
    asesor
  };
}

async function findInventoryByServiceCode(serviceCode) {
  const normalizedCode = normalizeString(serviceCode).toUpperCase();
  const inventoryName = SERVICE_MAP[normalizedCode];

  if (!inventoryName) {
    const error = new Error("service_code no soportado.");
    error.statusCode = 400;
    error.errorCode = "UNSUPPORTED_SERVICE_CODE";
    throw error;
  }

  let snap = null;
  const candidateNames = [
    inventoryName,
    ...(LEGACY_SERVICE_NAMES[normalizedCode] || [])
  ].filter(Boolean);

  for (const candidateName of candidateNames) {
    snap = await db
      .collection("inventario_dpr")
      .where("nombre", "==", candidateName)
      .limit(1)
      .get();

    if (!snap.empty) break;
  }

  if (!snap || snap.empty) {
    const error = new Error(`No existe inventario_dpr para ${candidateNames.join(" / ")}.`);
    error.statusCode = 404;
    error.errorCode = "INVENTORY_SERVICE_NOT_FOUND";
    throw error;
  }

  const doc = snap.docs[0];
  const data = doc.data();

  const precioVenta = Number(data.precioVenta);
  const costoPropio = Number(data.costoPropio || 0);

  if (!Number.isFinite(precioVenta) || precioVenta < 0) {
    const error = new Error("El servicio no tiene precioVenta válido.");
    error.statusCode = 500;
    error.errorCode = "INVALID_SERVICE_PRICE";
    throw error;
  }

  return {
    id: doc.id,
    serviceCode: normalizedCode,
    serviceName: inventoryName,
    precioVenta,
    costoPropio,
    raw: data
  };
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error("Cloudinary no está configurado en secretos de Functions.");
    error.statusCode = 500;
    error.errorCode = "CLOUDINARY_NOT_CONFIGURED";
    throw error;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

async function uploadBufferToCloudinary(file, folder) {
  if (!file) return "N/A";

  configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result?.secure_url || "N/A");
      }
    );

    stream.end(file.buffer);
  });
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getMultipartJsonField(req, name, fallback) {
  const raw = req.body?.[name];
  return parseJsonValue(raw, fallback);
}

function parseMultipartRequest(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers["content-type"] || "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      const error = new Error("Content-Type debe ser multipart/form-data.");
      error.statusCode = 400;
      error.errorCode = "INVALID_CONTENT_TYPE";
      reject(error);
      return;
    }

    if (!req.rawBody || !Buffer.isBuffer(req.rawBody)) {
      const error = new Error("No se recibió rawBody para procesar multipart/form-data.");
      error.statusCode = 400;
      error.errorCode = "RAW_BODY_REQUIRED";
      reject(error);
      return;
    }

    const fields = {};
    const files = {};

    let busboy;

    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 10,
          fileSize: 15 * 1024 * 1024
        }
      });
    } catch (error) {
      error.statusCode = 400;
      error.errorCode = "BUSBOY_INIT_ERROR";
      reject(error);
      return;
    }

    busboy.on("field", (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on("file", (fieldname, file, info) => {
      let filename = "archivo";
      let mimeType = "application/octet-stream";

      if (info && typeof info === "object") {
        filename = info.filename || filename;
        mimeType = info.mimeType || mimeType;
      }

      const chunks = [];
      let size = 0;
      let fileLimitReached = false;

      file.on("data", (data) => {
        chunks.push(data);
        size += data.length;
      });

      file.on("limit", () => {
        fileLimitReached = true;
      });

      file.on("end", () => {
        if (fileLimitReached) {
          const error = new Error(`El archivo ${filename} excede el tamaño permitido.`);
          error.statusCode = 413;
          error.errorCode = "FILE_TOO_LARGE";
          reject(error);
          return;
        }

        const uploadedFile = {
          fieldname,
          originalname: filename,
          mimetype: mimeType,
          size,
          buffer: Buffer.concat(chunks)
        };

        if (!files[fieldname]) files[fieldname] = [];
        files[fieldname].push(uploadedFile);
      });
    });

    busboy.on("error", (error) => {
      error.statusCode = 400;
      error.errorCode = "MULTIPART_PARSE_ERROR";
      reject(error);
    });

    busboy.on("finish", () => {
      resolve({ fields, files });
    });

    busboy.end(req.rawBody);
  });
}

async function notifyN8n(payload) {
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    return {
      ok: response.ok,
      status: response.status
    };
  } catch (error) {
    console.error("n8n webhook error:", error);

    return {
      ok: false,
      status: null,
      error: error.message
    };
  }
}

function sendError(res, error) {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    error_code: error.errorCode || "INTERNAL_ERROR",
    message: error.message || "Error interno."
  });
}

function validateAdminToken(req) {
  const adminToken = req.headers["x-admin-token"];

  if (!process.env.DPR_ADMIN_TOKEN || adminToken !== process.env.DPR_ADMIN_TOKEN) {
    const error = new Error("Token admin invalido.");
    error.statusCode = 401;
    error.errorCode = "INVALID_ADMIN_TOKEN";
    throw error;
  }
}

function normalizeForCompare(value) {
  return normalizeString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getDashboardServicePrice(serviceName, details = {}) {
  const normalizedName = normalizeForCompare(serviceName).toUpperCase();

  if (normalizedName === "ESTADO DE CUENTA AFORE") {
    const aforeType = normalizeForCompare(details.afore_tipo || "").toUpperCase();
    if (DASHBOARD_SERVICE_PRICES[aforeType] !== undefined) {
      return DASHBOARD_SERVICE_PRICES[aforeType];
    }
  }

  return DASHBOARD_SERVICE_PRICES[normalizedName];
}

function isApprovedRecharge(data) {
  const estatus = normalizeForCompare(data?.estatus || data?.status || "");
  return estatus.includes("aprob");
}

function isChargeableSolicitud(data) {
  const amount = Number(data?.costo ?? data?.precio ?? data?.monto ?? 0);
  if (!amount || amount <= 0) return false;

  const estatus = normalizeForCompare(data?.estatus || data?.status || "");
  const excluded = ["error", "rechaz", "cancel", "reembol", "devuelt"];
  if (excluded.some((item) => estatus.includes(item))) return false;

  if (Number(data?.monto_reembolsado || 0) > 0) return false;
  if (data?.saldo_devuelto === true || data?.devolucion_aplicada === true) return false;

  return true;
}

async function collectBalanceForAsesor(uid, asesor) {
  const email = normalizeForCompare(asesor.email || "");
  const rechargeDocs = new Map();
  const solicitudDocs = new Map();

  const rechargeByUid = await db
    .collection("notificaciones_pago")
    .where("uid", "==", uid)
    .get();

  rechargeByUid.forEach((doc) => rechargeDocs.set(doc.id, doc.data()));

  if (email) {
    const rechargeByEmail = await db
      .collection("notificaciones_pago")
      .where("asesorEmail", "==", asesor.email)
      .get();

    rechargeByEmail.forEach((doc) => rechargeDocs.set(doc.id, doc.data()));
  }

  const solicitudesByUid = await db
    .collection("solicitudes")
    .where("asesor_uid", "==", uid)
    .get();

  solicitudesByUid.forEach((doc) => solicitudDocs.set(doc.id, doc.data()));

  if (email) {
    const solicitudesByEmail = await db
      .collection("solicitudes")
      .where("nombre_asesor", "==", asesor.email)
      .get();

    solicitudesByEmail.forEach((doc) => solicitudDocs.set(doc.id, doc.data()));
  }

  let totalRecargasAprobadas = 0;
  let recargasAprobadas = 0;
  let recargasIgnoradas = 0;

  for (const data of rechargeDocs.values()) {
    if (isApprovedRecharge(data)) {
      totalRecargasAprobadas += Number(data.monto || 0);
      recargasAprobadas += 1;
    } else {
      recargasIgnoradas += 1;
    }
  }

  let totalGastado = 0;
  let solicitudesCobradas = 0;
  let solicitudesIgnoradas = 0;

  for (const data of solicitudDocs.values()) {
    if (isChargeableSolicitud(data)) {
      totalGastado += Number(data.costo ?? data.precio ?? data.monto ?? 0);
      solicitudesCobradas += 1;
    } else {
      solicitudesIgnoradas += 1;
    }
  }

  const saldoActual = Number(asesor.saldo || 0);
  const saldoCalculado = Number((totalRecargasAprobadas - totalGastado).toFixed(2));
  const saldoSugerido = Math.max(0, saldoCalculado);

  return {
    uid,
    email: asesor.email || "",
    nombre: asesor.nombre || "",
    saldo_actual: saldoActual,
    total_recargas_aprobadas: Number(totalRecargasAprobadas.toFixed(2)),
    total_gastado_tramites: Number(totalGastado.toFixed(2)),
    saldo_calculado: saldoCalculado,
    saldo_sugerido: saldoSugerido,
    diferencia: Number((saldoSugerido - saldoActual).toFixed(2)),
    recargas_aprobadas: recargasAprobadas,
    recargas_ignoradas: recargasIgnoradas,
    solicitudes_cobradas: solicitudesCobradas,
    solicitudes_ignoradas: solicitudesIgnoradas
  };
}

function getDateMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function getMovimientoDate(data) {
  const fields = [
    "fecha",
    "fecha_creacion",
    "fechaRegistro",
    "createdAt",
    "fecha_solicitud",
    "timestamp",
    "fecha_aprobacion",
    "fechaAprobacion"
  ];

  for (const field of fields) {
    const millis = getDateMillis(data?.[field]);
    if (millis) return millis;
  }

  return null;
}

function getMovimientoAmount(data, fields) {
  for (const field of fields) {
    const value = Number(data?.[field]);
    if (Number.isFinite(value)) return value;
  }

  return 0;
}

async function addDocsByQuery(target, queryRef) {
  const snap = await queryRef.get();
  snap.forEach((doc) => target.set(doc.id, doc.data() || {}));
}

async function collectMovimientosDesde(uid, email, cutoffMillis) {
  const normalizedEmail = normalizeString(email || "");
  const rechargeDocs = new Map();
  const solicitudDocs = new Map();

  await addDocsByQuery(
    rechargeDocs,
    db.collection("notificaciones_pago").where("uid", "==", uid)
  );

  await addDocsByQuery(
    rechargeDocs,
    db.collection("notificaciones_pago").where("asesor_uid", "==", uid)
  );

  if (normalizedEmail) {
    await addDocsByQuery(
      rechargeDocs,
      db.collection("notificaciones_pago").where("asesorEmail", "==", email)
    );

    await addDocsByQuery(
      rechargeDocs,
      db.collection("notificaciones_pago").where("email", "==", email)
    );
  }

  await addDocsByQuery(
    solicitudDocs,
    db.collection("solicitudes").where("asesor_uid", "==", uid)
  );

  if (normalizedEmail) {
    await addDocsByQuery(
      solicitudDocs,
      db.collection("solicitudes").where("nombre_asesor", "==", email)
    );

    await addDocsByQuery(
      solicitudDocs,
      db.collection("solicitudes").where("email", "==", email)
    );
  }

  let totalRecargasDespues = 0;
  let recargasDespues = 0;
  let totalTramitesDespues = 0;
  let tramitesDespues = 0;

  for (const data of rechargeDocs.values()) {
    const fecha = getMovimientoDate(data);
    if (!fecha || fecha <= cutoffMillis || !isApprovedRecharge(data)) continue;

    totalRecargasDespues += getMovimientoAmount(data, [
      "monto",
      "cantidad",
      "importe",
      "saldo",
      "valor"
    ]);
    recargasDespues += 1;
  }

  for (const data of solicitudDocs.values()) {
    const fecha = getMovimientoDate(data);
    if (!fecha || fecha <= cutoffMillis || !isChargeableSolicitud(data)) continue;

    totalTramitesDespues += getMovimientoAmount(data, [
      "costo",
      "precio",
      "monto",
      "valor"
    ]);
    tramitesDespues += 1;
  }

  return {
    recargas_despues_count: recargasDespues,
    recargas_despues_total: Number(totalRecargasDespues.toFixed(2)),
    tramites_despues_count: tramitesDespues,
    tramites_despues_total: Number(totalTramitesDespues.toFixed(2))
  };
}

async function findAsesorByEmail(database, email) {
  const snap = await database
    .collection("asesores")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() || {} };
}

async function findBackupAsesor(currentId, email) {
  try {
    const backupById = await backupDb.collection("asesores").doc(currentId).get();
    if (backupById.exists) {
      return { id: backupById.id, data: backupById.data() || {} };
    }
  } catch (error) {
    console.error("backup by id error:", error);
  }

  return findAsesorByEmail(backupDb, email);
}

async function buildBackupSaldoComparison(currentId, currentData, cutoffMillis) {
  const email = normalizeString(currentData?.email || "");
  const backupDoc = await findBackupAsesor(currentId, email);
  const backupData = backupDoc?.data || null;
  const saldoBackup = backupData ? Number(backupData.saldo || 0) : null;
  const saldoActual = Number(currentData?.saldo || 0);
  const movimientos = await collectMovimientosDesde(currentId, email, cutoffMillis);
  const saldoEsperado = backupData
    ? Number((saldoBackup + movimientos.recargas_despues_total - movimientos.tramites_despues_total).toFixed(2))
    : null;
  const diferenciaActualMenosEsperado = saldoEsperado === null
    ? null
    : Number((saldoActual - saldoEsperado).toFixed(2));
  const montoARestaurar = saldoEsperado !== null && saldoEsperado > saldoActual
    ? Number((saldoEsperado - saldoActual).toFixed(2))
    : 0;

  return {
    email,
    uid: currentId,
    found_current: true,
    found_backup: Boolean(backupData),
    backup_uid: backupDoc?.id || null,
    saldo_backup: saldoBackup,
    saldo_actual: saldoActual,
    ...movimientos,
    saldo_esperado: saldoEsperado,
    diferencia_actual_menos_esperado: diferenciaActualMenosEsperado,
    monto_a_restaurar: montoARestaurar
  };
}

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "DPR API",
    status: "ok"
  });
});

app.post("/api/v1/dashboard/bootstrap", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);

    res.json({
      success: true,
      asesor: {
        uid: auth.uid,
        email: auth.email || auth.asesor.email || "",
        nombre: auth.asesor.nombre || "",
        saldo: Number(auth.asesor.saldo_actual || 0)
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/balance", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const asesor = await getSupabaseAsesorByUid(auth.uid);

    if (!asesor) {
      const error = new Error("No existe el expediente del asesor.");
      error.statusCode = 404;
      error.errorCode = "ASESOR_NOT_FOUND";
      throw error;
    }

    res.json({
      success: true,
      saldo: Number(asesor.saldo_actual || 0),
      asesor: {
        uid: auth.uid,
        email: auth.email || asesor.email || "",
        nombre: asesor.nombre || ""
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/services", async (req, res) => {
  try {
    await authenticateDashboardUser(req);

    res.json({
      success: true,
      prices: DASHBOARD_SERVICE_PRICES
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/requests", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const rows = await supabaseRequest(
      `solicitudes?firebase_uid=eq.${supabaseEq(auth.uid)}&select=*&order=fecha.desc&limit=200`
    );

    res.json({
      success: true,
      requests: (rows || []).map(mapSupabaseSolicitud)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/dashboard/requests", async (req, res) => {
  let auth = null;
  let solicitudId = null;

  try {
    auth = await authenticateDashboardUser(req);

    const body = req.body || {};
    const serviceName = normalizeString(body.service_name || body.tipo);
    const serviceDisplayName = normalizeString(body.service_display_name || serviceName);
    const costoSolicitado = Number(body.costo || 0);

    if (!serviceName) {
      const error = new Error("El tramite es obligatorio.");
      error.statusCode = 400;
      error.errorCode = "SERVICE_REQUIRED";
      throw error;
    }

    if (!Number.isFinite(costoSolicitado) || costoSolicitado <= 0 || costoSolicitado > 10000) {
      const error = new Error("Costo de tramite invalido.");
      error.statusCode = 400;
      error.errorCode = "INVALID_SERVICE_COST";
      throw error;
    }

    const curp = normalizeString(body.curp || "N/A").toUpperCase() || "N/A";
    const nss = normalizeString(body.nss || "N/A") || "N/A";
    const detallesExtra = body.detalles_extra && typeof body.detalles_extra === "object" ? body.detalles_extra : {};
    const cuestionario = body.cuestionario || "N/A";
    const costoServidor = getDashboardServicePrice(serviceName, detallesExtra);

    if (!Number.isFinite(costoServidor) || costoServidor <= 0) {
      const error = new Error("Tramite no soportado por el catalogo seguro.");
      error.statusCode = 400;
      error.errorCode = "UNSUPPORTED_DASHBOARD_SERVICE";
      throw error;
    }

    if (costoSolicitado !== costoServidor) {
      console.warn("dashboard cost mismatch", {
        uid: auth.uid,
        email: auth.email || auth.asesor.email || "",
        serviceName,
        serviceDisplayName,
        costoSolicitado,
        costoServidor
      });
    }

    const asesor = await getSupabaseAsesorByUid(auth.uid);

    if (!asesor) {
      const error = new Error("No existe el expediente del asesor.");
      error.statusCode = 404;
      error.errorCode = "ASESOR_NOT_FOUND";
      throw error;
    }

    if (asesor.activo === false || asesor.inhabilitado === true) {
      const error = new Error("Tu cuenta se encuentra inhabilitada. Contacta a soporte.");
      error.statusCode = 403;
      error.errorCode = "ASESOR_DISABLED";
      throw error;
    }

    const balanceBefore = Number(asesor.saldo_actual || 0);

    if (balanceBefore < costoServidor) {
      const error = new Error("Saldo insuficiente.");
      error.statusCode = 402;
      error.errorCode = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const balanceAfter = balanceBefore - costoServidor;
    solicitudId = crypto.randomUUID();
    const now = new Date().toISOString();
    const asesorEmail = auth.email || asesor.email || "";

    await supabaseRequest(`asesores?firebase_uid=eq.${supabaseEq(auth.uid)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        saldo_actual: balanceAfter
      })
    });

    try {
      await supabaseRequest("solicitudes", {
        method: "POST",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify([{
          firebase_id: solicitudId,
          firebase_uid: auth.uid,
          email: asesorEmail,
          tipo: serviceDisplayName,
          costo: costoServidor,
          estatus: "En Proceso",
          finalizado: false,
          reembolsado: false,
          monto_reembolsado: 0,
          fecha: now,
          curp,
          nss,
          detalles_extra: detallesExtra,
          cuestionario,
          raw_data: {
            origen: "dashboard",
            created_via: "dashboard_backend",
            file_ine_f: normalizeString(body.file_ine_f || "N/A") || "N/A",
            file_ine_r: normalizeString(body.file_ine_r || "N/A") || "N/A",
            file_selfie: normalizeString(body.file_selfie || "N/A") || "N/A",
            file_comp_domicilio: normalizeString(body.file_comp_domicilio || "N/A") || "N/A",
            file_edocta: normalizeString(body.file_edocta || "N/A") || "N/A"
          }
        }])
      });
    } catch (error) {
      await supabaseRequest(`asesores?firebase_uid=eq.${supabaseEq(auth.uid)}`, {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          saldo_actual: balanceBefore
        })
      });
      throw error;
    }

    await insertSupabaseMovimientoSaldo({
      firebase_uid: auth.uid,
      email: asesorEmail,
      tipo: "cargo_tramite",
      monto: -costoServidor,
      saldo_antes: balanceBefore,
      saldo_despues: balanceAfter,
      referencia_id: solicitudId,
      referencia_tipo: "solicitudes",
      descripcion: `Cargo por tramite: ${serviceDisplayName}`,
      origen: "dashboard",
      fecha_movimiento: now,
      raw_data: {
        tramite: serviceDisplayName
      }
    });

    const n8nResult = await notifyN8n({
      id_solicitud: solicitudId,
      asesor: auth.email || auth.asesor.email || "",
      tramite: serviceDisplayName,
      curp,
      nss,
      extra: detallesExtra,
      quest: cuestionario,
      file_ine_f: normalizeString(body.file_ine_f || "N/A") || "N/A",
      file_ine_r: normalizeString(body.file_ine_r || "N/A") || "N/A",
      file_selfie: normalizeString(body.file_selfie || "N/A") || "N/A",
      file_comp_domicilio: normalizeString(body.file_comp_domicilio || "N/A") || "N/A",
      file_edocta: normalizeString(body.file_edocta || "N/A") || "N/A",
      origen: "dashboard"
    });

    res.status(201).json({
      success: true,
      solicitud_id: solicitudId,
      saldo_anterior: balanceBefore,
      saldo_nuevo: balanceAfter,
      costo: costoServidor,
      n8n_ok: n8nResult.ok
    });
  } catch (error) {
    console.error("dashboard request error", error);
    sendError(res, error);
  }
});

app.post("/api/v1/dashboard/payment-notifications", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const body = req.body || {};
    const monto = Number(body.monto || 0);
    const rastreo = normalizeString(body.rastreo).toUpperCase();
    const comprobante = normalizeString(body.comprobante);

    if (!Number.isFinite(monto) || monto < 200) {
      const error = new Error("El monto minimo de recarga es $200.");
      error.statusCode = 400;
      error.errorCode = "INVALID_RECHARGE_AMOUNT";
      throw error;
    }

    if (!rastreo || !comprobante) {
      const error = new Error("Falta clave de rastreo o comprobante.");
      error.statusCode = 400;
      error.errorCode = "PAYMENT_DATA_REQUIRED";
      throw error;
    }

    const notificacionId = crypto.randomUUID();

    await supabaseRequest("notificaciones_pago", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify([{
        firebase_id: notificacionId,
        firebase_uid: auth.uid,
        email: auth.email || auth.asesor.email || "",
        monto,
        rastreo,
        comprobante_url: comprobante,
        estatus: "pendiente",
        fecha: new Date().toISOString(),
        raw_data: {
          uid: auth.uid,
          asesor_uid: auth.uid,
          asesorEmail: auth.email || auth.asesor.email || "",
          comprobante,
          origen: "dashboard_backend"
        }
      }])
    });

    res.status(201).json({
      success: true,
      notificacion_id: notificacionId
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/chat", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const rows = await supabaseRequest(
      `chat_soporte?firebase_uid=eq.${supabaseEq(auth.uid)}&select=*&order=fecha.asc&limit=200`
    );

    res.json({
      success: true,
      messages: (rows || []).map(mapSupabaseChat)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/dashboard/chat", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const texto = normalizeString(req.body?.texto);

    if (!texto || texto.length > 1200) {
      const error = new Error("Mensaje invalido.");
      error.statusCode = 400;
      error.errorCode = "INVALID_CHAT_MESSAGE";
      throw error;
    }

    const mensajeId = crypto.randomUUID();

    await supabaseRequest("chat_soporte", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify([{
        firebase_id: mensajeId,
        firebase_uid: auth.uid,
        email: auth.email || auth.asesor.email || "",
        remitente: auth.email || auth.asesor.email || "",
        texto,
        respondido: false,
        fecha: new Date().toISOString(),
        raw_data: {
          origen: "dashboard_backend"
        }
      }])
    });

    res.status(201).json({
      success: true,
      mensaje_id: mensajeId
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/dashboard/requests/:id/downloaded", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const solicitudId = normalizeString(req.params.id);

    if (!solicitudId) {
      const error = new Error("Solicitud invalida.");
      error.statusCode = 400;
      error.errorCode = "INVALID_REQUEST_ID";
      throw error;
    }

    const rows = await supabaseRequest(
      `solicitudes?firebase_id=eq.${supabaseEq(solicitudId)}&select=*&limit=1`
    );
    const solicitud = rows?.[0] || null;

    if (!solicitud) {
      const error = new Error("Solicitud no encontrada.");
      error.statusCode = 404;
      error.errorCode = "REQUEST_NOT_FOUND";
      throw error;
    }

    if (solicitud.firebase_uid !== auth.uid) {
      const error = new Error("No tienes permiso para modificar esta solicitud.");
      error.statusCode = 403;
      error.errorCode = "REQUEST_FORBIDDEN";
      throw error;
    }

    await supabaseRequest(`solicitudes?firebase_id=eq.${supabaseEq(solicitudId)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        raw_data: {
          ...(solicitud.raw_data || {}),
          descargado_cliente: true,
          fecha_descarga_cliente: new Date().toISOString()
        }
      })
    });

    res.json({
      success: true
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/me/api-key", async (req, res) => {
  try {
    const auth = await authenticateFirebaseUser(req);

    const snap = await db
      .collection("api_keys")
      .where("asesor_uid", "==", auth.uid)
      .where("estatus", "==", "activa")
      .limit(1)
      .get();

    if (snap.empty) {
      return res.json({
        success: true,
        has_api_key: false,
        api_key_id: null,
        key_prefix: null,
        message: "No tienes una API Key activa."
      });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    res.json({
      success: true,
      has_api_key: true,
      api_key_id: doc.id,
      key_prefix: data.key_prefix || "",
      permisos: Array.isArray(data.permisos) ? data.permisos : [],
      created_at: data.created_at || null,
      last_used_at: data.last_used_at || null,
      message: "Ya tienes una API Key activa. Por seguridad no se puede volver a mostrar completa."
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/me/api-key", async (req, res) => {
  try {
    const auth = await authenticateFirebaseUser(req);
    const rotate = req.body?.rotate === true;

    const activeSnap = await db
      .collection("api_keys")
      .where("asesor_uid", "==", auth.uid)
      .where("estatus", "==", "activa")
      .get();

    if (!activeSnap.empty && !rotate) {
      const activeDoc = activeSnap.docs[0];
      const activeData = activeDoc.data();

      return res.status(409).json({
        success: false,
        error_code: "ACTIVE_API_KEY_EXISTS",
        message: "Ya tienes una API Key activa. Si necesitas una nueva, usa la opción de rotar.",
        api_key_id: activeDoc.id,
        key_prefix: activeData.key_prefix || ""
      });
    }

    const apiKey = createApiKey();
    const apiKeyPrefix = getKeyPrefix(apiKey);

    const batch = db.batch();

    if (!activeSnap.empty && rotate) {
      activeSnap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          estatus: "inactiva",
          updated_at: FieldValue.serverTimestamp(),
          revoked_at: FieldValue.serverTimestamp(),
          revoked_reason: "Rotada por asesor desde dashboard"
        });
      });
    }

    const apiKeyRef = db.collection("api_keys").doc();

    batch.set(apiKeyRef, {
      asesor_uid: auth.uid,
      asesor_email: auth.asesor.email || auth.email || "",
      nombre: auth.asesor.nombre || "",
      key_prefix: apiKeyPrefix,
      key_hash: sha256(apiKey),
      estatus: "activa",
      permisos: ["requests:create", "requests:read", "balance:read"],
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      last_used_at: null,
      revoked_at: null,
      revoked_reason: null,
      created_by: "advisor_dashboard",
      notes: req.body?.notes || "API Key generada por asesor desde dashboard"
    });

    await batch.commit();

    await writeUsageLog({
      asesor_uid: auth.uid,
      asesor_email: auth.asesor.email || auth.email || "",
      api_key_id: apiKeyRef.id,
      key_prefix: apiKeyPrefix,
      endpoint: "/api/v1/me/api-key",
      method: "POST",
      status_code: 201,
      success: true,
      action: rotate ? "rotate_api_key" : "create_api_key",
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.status(201).json({
      success: true,
      api_key_id: apiKeyRef.id,
      api_key: apiKey,
      key_prefix: apiKeyPrefix,
      asesor_uid: auth.uid,
      asesor_email: auth.asesor.email || auth.email || "",
      permisos: ["requests:create", "requests:read", "balance:read"],
      message: "Guarda esta API Key ahora. No se volverá a mostrar completa."
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/api-keys", async (req, res) => {
  try {
    const adminToken = req.headers["x-admin-token"];

    if (!process.env.DPR_ADMIN_TOKEN || adminToken !== process.env.DPR_ADMIN_TOKEN) {
      return res.status(401).json({
        success: false,
        error_code: "INVALID_ADMIN_TOKEN",
        message: "Token admin inválido."
      });
    }

    const asesorUid = normalizeString(req.body.asesor_uid);

    if (!asesorUid) {
      return res.status(400).json({
        success: false,
        error_code: "ASESOR_UID_REQUIRED",
        message: "asesor_uid es obligatorio."
      });
    }

    const asesorRef = db.collection("asesores").doc(asesorUid);
    const asesorSnap = await asesorRef.get();

    if (!asesorSnap.exists) {
      return res.status(404).json({
        success: false,
        error_code: "ASESOR_NOT_FOUND",
        message: "No existe el asesor indicado."
      });
    }

    const asesor = asesorSnap.data();
    const apiKey = createApiKey();

    const apiKeyDoc = await db.collection("api_keys").add({
      asesor_uid: asesorUid,
      asesor_email: asesor.email || "",
      nombre: asesor.nombre || "",
      key_prefix: getKeyPrefix(apiKey),
      key_hash: sha256(apiKey),
      estatus: "activa",
      permisos: ["requests:create", "requests:read", "balance:read"],
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      last_used_at: null,
      revoked_at: null,
      revoked_reason: null,
      created_by: "admin_api",
      notes: req.body.notes || "API Key generada desde endpoint admin"
    });

    res.status(201).json({
      success: true,
      api_key_id: apiKeyDoc.id,
      api_key: apiKey,
      key_prefix: getKeyPrefix(apiKey),
      asesor_uid: asesorUid,
      asesor_email: asesor.email || "",
      message: "Guarda esta API Key ahora. No se volverá a mostrar."
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/rebuild-asesores-from-auth", async (req, res) => {
  try {
    validateAdminToken(req);

    const dryRun = req.body?.dry_run !== false;
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 100), 1000));
    const pageToken = normalizeString(req.body?.page_token || "");

    const result = await admin.auth().listUsers(limit, pageToken || undefined);
    const batch = db.batch();
    const created = [];
    const completed = [];
    const skipped = [];

    for (const user of result.users) {
      if (!user.uid) continue;

      const asesorRef = db.collection("asesores").doc(user.uid);
      const asesorSnap = await asesorRef.get();
      const data = asesorSnap.exists ? asesorSnap.data() : {};
      const email = data.email || user.email || "";
      const nombre = data.nombre || user.displayName || (email ? email.split("@")[0] : "Usuario");

      const patch = {};
      if (!data.email && email) patch.email = email;
      if (!data.nombre && nombre) patch.nombre = nombre;
      if (!data.role) patch.role = "user";
      if (data.saldo === undefined) patch.saldo = 0;
      if (data.activo === undefined) patch.activo = true;
      if (!data.fechaRegistro) patch.fechaRegistro = FieldValue.serverTimestamp();

      if (!asesorSnap.exists) {
        created.push({ uid: user.uid, email, nombre });
      } else if (Object.keys(patch).length) {
        completed.push({ uid: user.uid, email, campos: Object.keys(patch) });
      } else {
        skipped.push({ uid: user.uid, email });
      }

      if (!dryRun && Object.keys(patch).length) {
        batch.set(asesorRef, patch, { merge: true });
      }
    }

    if (!dryRun) {
      await batch.commit();
    }

    res.json({
      success: true,
      dry_run: dryRun,
      processed: result.users.length,
      created_count: created.length,
      completed_count: completed.length,
      skipped_count: skipped.length,
      next_page_token: result.pageToken || null,
      created,
      completed,
      skipped: skipped.slice(0, 25)
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/preview-saldos", async (req, res) => {
  try {
    validateAdminToken(req);

    const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 300));
    const startAfter = normalizeString(req.body?.start_after || "");
    const onlyDifferences = req.body?.only_differences !== false;
    const minDifference = Number(req.body?.min_difference ?? 0);

    let queryRef = db
      .collection("asesores")
      .orderBy(FieldPath.documentId())
      .limit(limit);

    if (startAfter) {
      queryRef = queryRef.startAfter(startAfter);
    }

    const snap = await queryRef.get();
    const rows = [];
    let lastDocId = null;

    for (const doc of snap.docs) {
      lastDocId = doc.id;
      const row = await collectBalanceForAsesor(doc.id, doc.data() || {});
      const absoluteDifference = Math.abs(Number(row.diferencia || 0));

      if (!onlyDifferences || absoluteDifference > minDifference) {
        rows.push(row);
      }
    }

    res.json({
      success: true,
      processed: snap.size,
      returned: rows.length,
      limit,
      start_after: startAfter || null,
      next_start_after: snap.size === limit ? lastDocId : null,
      only_differences: onlyDifferences,
      min_difference: minDifference,
      rows
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/compare-saldos-backup", async (req, res) => {
  try {
    validateAdminToken(req);

    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map((email) => normalizeString(email)).filter(Boolean)
      : [];
    const cutoffInput = normalizeString(req.body?.cutoff || "2026-06-17T16:24:40.000Z");
    const cutoffMillis = new Date(cutoffInput).getTime();
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 300));
    const startAfter = normalizeString(req.body?.start_after || "");
    const onlyRestoreCandidates = req.body?.only_restore_candidates === true;

    if (!Number.isFinite(cutoffMillis)) {
      const error = new Error("cutoff invalido.");
      error.statusCode = 400;
      error.errorCode = "INVALID_CUTOFF";
      throw error;
    }

    let processed = 0;
    let nextStartAfter = null;
    const rows = [];

    if (emails.length) {
      for (const email of emails) {
        const current = await findAsesorByEmail(db, email);

        if (!current) {
          rows.push({
            email,
            found_current: false,
            found_backup: false,
            message: "No encontrado en base actual."
          });
          continue;
        }

        processed += 1;
        const row = await buildBackupSaldoComparison(current.id, current.data || {}, cutoffMillis);
        if (!onlyRestoreCandidates || Number(row.monto_a_restaurar || 0) > 0) rows.push(row);
      }
    } else {
      let queryRef = db
        .collection("asesores")
        .orderBy(FieldPath.documentId())
        .limit(limit);

      if (startAfter) {
        queryRef = queryRef.startAfter(startAfter);
      }

      const snap = await queryRef.get();
      processed = snap.size;
      nextStartAfter = snap.size === limit ? snap.docs[snap.docs.length - 1]?.id || null : null;

      for (const doc of snap.docs) {
        const row = await buildBackupSaldoComparison(doc.id, doc.data() || {}, cutoffMillis);
        if (!onlyRestoreCandidates || Number(row.monto_a_restaurar || 0) > 0) rows.push(row);
      }
    }

    res.json({
      success: true,
      backup_database: "revert-saldos",
      cutoff: new Date(cutoffMillis).toISOString(),
      processed,
      returned: rows.length,
      limit: emails.length ? null : limit,
      start_after: startAfter || null,
      next_start_after: nextStartAfter,
      only_restore_candidates: onlyRestoreCandidates,
      rows
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/apply-saldos-backup", async (req, res) => {
  try {
    validateAdminToken(req);

    const dryRun = req.body?.dry_run !== false;
    const cutoffInput = normalizeString(req.body?.cutoff || "2026-06-17T16:24:40.000Z");
    const cutoffMillis = new Date(cutoffInput).getTime();
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 300));
    const startAfter = normalizeString(req.body?.start_after || "");
    const minRestore = Number(req.body?.min_restore ?? 0);

    if (!Number.isFinite(cutoffMillis)) {
      const error = new Error("cutoff invalido.");
      error.statusCode = 400;
      error.errorCode = "INVALID_CUTOFF";
      throw error;
    }

    let queryRef = db
      .collection("asesores")
      .orderBy(FieldPath.documentId())
      .limit(limit);

    if (startAfter) {
      queryRef = queryRef.startAfter(startAfter);
    }

    const snap = await queryRef.get();
    const batch = db.batch();
    const applied = [];
    const skipped = [];
    const nextStartAfter = snap.size === limit ? snap.docs[snap.docs.length - 1]?.id || null : null;
    let totalRestored = 0;

    for (const doc of snap.docs) {
      const row = await buildBackupSaldoComparison(doc.id, doc.data() || {}, cutoffMillis);
      const amountToRestore = Number(row.monto_a_restaurar || 0);

      if (row.found_backup && amountToRestore > minRestore) {
        totalRestored += amountToRestore;
        applied.push({
          ...row,
          saldo_anterior: row.saldo_actual,
          saldo_nuevo: row.saldo_esperado
        });

        if (!dryRun) {
          batch.set(doc.ref, {
            saldo: row.saldo_esperado,
            ultimoAjusteSaldo: FieldValue.serverTimestamp(),
            ajusteManualSaldo: {
              realizado_por: "codex_admin",
              motivo: "Restauracion desde backup revert-saldos y movimientos posteriores",
              saldo_anterior: row.saldo_actual,
              saldo_nuevo: row.saldo_esperado,
              monto: amountToRestore,
              saldo_backup: row.saldo_backup,
              recargas_despues_total: row.recargas_despues_total,
              tramites_despues_total: row.tramites_despues_total,
              cutoff: new Date(cutoffMillis).toISOString(),
              endpoint: "apply-saldos-backup",
              fecha: FieldValue.serverTimestamp()
            }
          }, { merge: true });
        }
      } else {
        skipped.push({
          uid: row.uid,
          email: row.email,
          found_backup: row.found_backup,
          saldo_actual: row.saldo_actual,
          saldo_esperado: row.saldo_esperado,
          monto_a_restaurar: amountToRestore
        });
      }
    }

    if (!dryRun && applied.length) {
      await batch.commit();
    }

    res.json({
      success: true,
      dry_run: dryRun,
      backup_database: "revert-saldos",
      cutoff: new Date(cutoffMillis).toISOString(),
      processed: snap.size,
      applied_count: applied.length,
      skipped_count: skipped.length,
      total_restored: Number(totalRestored.toFixed(2)),
      limit,
      start_after: startAfter || null,
      next_start_after: nextStartAfter,
      applied,
      skipped: skipped.slice(0, 25)
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.post("/api/v1/admin/apply-saldos", async (req, res) => {
  try {
    validateAdminToken(req);

    const dryRun = req.body?.dry_run !== false;
    const limit = Math.max(1, Math.min(Number(req.body?.limit || 25), 100));
    const startAfter = normalizeString(req.body?.start_after || "");
    const minDifference = Number(req.body?.min_difference ?? 0);

    let queryRef = db
      .collection("asesores")
      .orderBy(FieldPath.documentId())
      .limit(limit);

    if (startAfter) {
      queryRef = queryRef.startAfter(startAfter);
    }

    const snap = await queryRef.get();
    const batch = db.batch();
    const applied = [];
    const skipped = [];
    let lastDocId = null;
    let totalRestored = 0;

    for (const doc of snap.docs) {
      lastDocId = doc.id;
      const asesor = doc.data() || {};
      const row = await collectBalanceForAsesor(doc.id, asesor);
      const currentBalance = Number(row.saldo_actual || 0);
      const suggestedBalance = Number(row.saldo_sugerido || 0);
      const difference = Number((suggestedBalance - currentBalance).toFixed(2));

      if (suggestedBalance > currentBalance && difference > minDifference) {
        totalRestored += difference;
        applied.push({
          ...row,
          saldo_anterior: currentBalance,
          saldo_nuevo: suggestedBalance,
          monto_a_restaurar: difference
        });

        if (!dryRun) {
          batch.set(doc.ref, {
            saldo: suggestedBalance,
            saldoRestauradoAutomatico: true,
            fechaRestauracionSaldo: FieldValue.serverTimestamp(),
            restauracionSaldoDetalle: {
              saldo_anterior: currentBalance,
              saldo_nuevo: suggestedBalance,
              monto_restaurado: difference,
              total_recargas_aprobadas: row.total_recargas_aprobadas,
              total_gastado_tramites: row.total_gastado_tramites,
              recargas_aprobadas: row.recargas_aprobadas,
              solicitudes_cobradas: row.solicitudes_cobradas,
              endpoint: "apply-saldos"
            }
          }, { merge: true });
        }
      } else {
        skipped.push({
          uid: doc.id,
          email: asesor.email || "",
          saldo_actual: currentBalance,
          saldo_sugerido: suggestedBalance,
          diferencia: difference
        });
      }
    }

    if (!dryRun && applied.length) {
      await batch.commit();
    }

    res.json({
      success: true,
      dry_run: dryRun,
      processed: snap.size,
      applied_count: applied.length,
      skipped_count: skipped.length,
      total_restored: Number(totalRestored.toFixed(2)),
      limit,
      start_after: startAfter || null,
      next_start_after: snap.size === limit ? lastDocId : null,
      min_difference: minDifference,
      applied,
      skipped: skipped.slice(0, 25)
    });
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

app.get("/api/v1/balance", async (req, res) => {
  try {
    const auth = await authenticateApiKey(req, "balance:read");

    await writeUsageLog({
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      api_key_id: auth.apiKeyId,
      key_prefix: auth.apiKeyPrefix,
      endpoint: "/api/v1/balance",
      method: "GET",
      status_code: 200,
      success: true,
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.json({
      success: true,
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || "",
      nombre: auth.asesor.nombre || "",
      saldo: Number(auth.asesor.saldo || 0)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/services", async (req, res) => {
  try {
    const auth = await authenticateApiKey(req, "requests:create");

    const services = [];

    for (const [serviceCode, inventoryName] of Object.entries(SERVICE_MAP)) {
      let snap = null;
      const candidateNames = [
        inventoryName,
        ...(LEGACY_SERVICE_NAMES[serviceCode] || [])
      ].filter(Boolean);

      for (const candidateName of candidateNames) {
        snap = await db
          .collection("inventario_dpr")
          .where("nombre", "==", candidateName)
          .limit(1)
          .get();

        if (!snap.empty) break;
      }

      if (snap && !snap.empty) {
        const doc = snap.docs[0];
        const item = doc.data();

        services.push({
          service_code: serviceCode,
          service_name: inventoryName,
          inventario_nombre: item.nombre,
          inventario_id: doc.id,
          precio_venta: Number(item.precioVenta || 0),
          costo_propio: Number(item.costoPropio || 0)
        });
      }
    }

    await writeUsageLog({
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      api_key_id: auth.apiKeyId,
      key_prefix: auth.apiKeyPrefix,
      endpoint: "/api/v1/services",
      method: "GET",
      status_code: 200,
      success: true,
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.json({
      success: true,
      services
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post(
  "/api/v1/requests",
  upload.fields([
    { name: "file_ine_f", maxCount: 1 },
    { name: "file_ine_r", maxCount: 1 },
    { name: "file_selfie", maxCount: 1 },
    { name: "file_comp_domicilio", maxCount: 1 },
    { name: "file_edocta", maxCount: 1 }
  ]),
  async (req, res) => {
    let auth = null;
    let inventory = null;
    let externalReference = null;

    try {
      auth = await authenticateApiKey(req, "requests:create");

      const serviceCode = normalizeString(req.body.service_code).toUpperCase();
      externalReference = normalizeString(req.body.external_reference) || "N/A";

      if (!serviceCode) {
        const error = new Error("service_code es obligatorio.");
        error.statusCode = 400;
        error.errorCode = "SERVICE_CODE_REQUIRED";
        throw error;
      }

      inventory = await findInventoryByServiceCode(serviceCode);

      const curp = normalizeString(req.body.curp || "N/A").toUpperCase() || "N/A";
      const nss = normalizeString(req.body.nss || "N/A") || "N/A";

      const detailsFromBody = getMultipartJsonField(req, "details", {});

      const details = {
        ...EXTRA_DEFAULTS,
        ...detailsFromBody,
        referencia_externa: externalReference
      };

      const questionnaire = getMultipartJsonField(req, "cuestionario", "N/A");

      const folder = `dpr_api/${auth.asesor.id}/${Date.now()}`;

      const file_ine_f = await uploadBufferToCloudinary(req.files?.file_ine_f?.[0], folder);
      const file_ine_r = await uploadBufferToCloudinary(req.files?.file_ine_r?.[0], folder);
      const file_selfie = await uploadBufferToCloudinary(req.files?.file_selfie?.[0], folder);
      const file_comp_domicilio = await uploadBufferToCloudinary(req.files?.file_comp_domicilio?.[0], folder);
      const file_edocta = await uploadBufferToCloudinary(req.files?.file_edocta?.[0], folder);

      let solicitudId = null;
      let balanceBefore = 0;
      let balanceAfter = 0;

      await db.runTransaction(async (tx) => {
        const asesorSnap = await tx.get(auth.asesorRef);

        if (!asesorSnap.exists) {
          const error = new Error("El asesor no existe.");
          error.statusCode = 404;
          error.errorCode = "ASESOR_NOT_FOUND";
          throw error;
        }

        const asesorData = asesorSnap.data();
        balanceBefore = Number(asesorData.saldo || 0);
        balanceAfter = balanceBefore - inventory.precioVenta;

        if (balanceBefore < inventory.precioVenta) {
          const error = new Error("Saldo insuficiente.");
          error.statusCode = 402;
          error.errorCode = "INSUFFICIENT_BALANCE";
          throw error;
        }

        const solicitudRef = db.collection("solicitudes").doc();
        solicitudId = solicitudRef.id;

        tx.update(auth.asesorRef, {
          saldo: balanceAfter
        });

        tx.set(solicitudRef, {
          asesor_uid: auth.asesor.id,
          nombre_asesor: auth.asesor.email || auth.apiKeyData.asesor_email || "",

          tipo: inventory.serviceName,
          service_code: inventory.serviceCode,
          inventario_id: inventory.id,

          costo: inventory.precioVenta,
          costoPropio: inventory.costoPropio,

          estatus: "En Proceso",
          finalizado: false,
          fecha: FieldValue.serverTimestamp(),

          curp,
          nss,

          origen: "API",
          created_via: "api",
          api_key_id: auth.apiKeyId,
          api_key_prefix: auth.apiKeyPrefix,
          referencia_externa: externalReference,

          detalles_extra: details,
          cuestionario: questionnaire,

          file_ine_f,
          file_ine_r,
          file_selfie,
          file_comp_domicilio,
          file_edocta
        });
      });

      const n8nResult = await notifyN8n({
        id_solicitud: solicitudId,
        asesor: auth.asesor.email || auth.apiKeyData.asesor_email || "",
        tramite: inventory.serviceName,
        curp,
        nss,
        extra: details,
        quest: questionnaire,
        file_ine_f,
        file_ine_r,
        file_selfie,
        file_comp_domicilio,
        file_edocta,
        origen: "API",
        referencia_externa: externalReference
      });

      await writeUsageLog({
        asesor_uid: auth.asesor.id,
        asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
        api_key_id: auth.apiKeyId,
        key_prefix: auth.apiKeyPrefix,
        endpoint: "/api/v1/requests",
        method: "POST",
        status_code: 201,
        success: true,
        service_code: inventory.serviceCode,
        service_name: inventory.serviceName,
        solicitud_id: solicitudId,
        external_reference: externalReference,
        precio_venta: inventory.precioVenta,
        costo_propio: inventory.costoPropio,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        n8n_ok: n8nResult.ok,
        n8n_status: n8nResult.status,
        ip: getRequestIp(req),
        user_agent: req.headers["user-agent"] || null
      });

      res.status(201).json({
        success: true,
        solicitud_id: solicitudId,
        external_reference: externalReference,
        service_code: inventory.serviceCode,
        service_name: inventory.serviceName,
        estatus: "En Proceso",
        costo: inventory.precioVenta,
        balance_before: balanceBefore,
        balance_after: balanceAfter
      });
    } catch (error) {
      console.error(error);

      if (auth) {
        await writeUsageLog({
          asesor_uid: auth.asesor?.id || auth.apiKeyData?.asesor_uid || null,
          asesor_email: auth.asesor?.email || auth.apiKeyData?.asesor_email || "",
          api_key_id: auth.apiKeyId,
          key_prefix: auth.apiKeyPrefix,
          endpoint: "/api/v1/requests",
          method: "POST",
          status_code: error.statusCode || 500,
          success: false,
          service_code: inventory?.serviceCode || normalizeString(req.body?.service_code).toUpperCase() || null,
          service_name: inventory?.serviceName || null,
          solicitud_id: null,
          external_reference: externalReference,
          precio_venta: inventory?.precioVenta || null,
          costo_propio: inventory?.costoPropio || null,
          error_code: error.errorCode || "INTERNAL_ERROR",
          error_message: error.message || "Error interno.",
          ip: getRequestIp(req),
          user_agent: req.headers["user-agent"] || null
        });
      }

      sendError(res, error);
    }
  }
);

app.post("/api/v1/requests-with-files", async (req, res) => {
  let auth = null;
  let inventory = null;
  let externalReference = null;
  let body = {};
  let files = {};

  try {
    auth = await authenticateApiKey(req, "requests:create");

    const parsed = await parseMultipartRequest(req);
    body = parsed.fields || {};
    files = parsed.files || {};

    const serviceCode = normalizeString(body.service_code).toUpperCase();
    externalReference = normalizeString(body.external_reference) || "N/A";

    if (!serviceCode) {
      const error = new Error("service_code es obligatorio.");
      error.statusCode = 400;
      error.errorCode = "SERVICE_CODE_REQUIRED";
      throw error;
    }

    inventory = await findInventoryByServiceCode(serviceCode);

    const curp = normalizeString(body.curp || "N/A").toUpperCase() || "N/A";
    const nss = normalizeString(body.nss || "N/A") || "N/A";

    const detailsFromBody = parseJsonValue(body.details, {});

    const details = {
      ...EXTRA_DEFAULTS,
      ...detailsFromBody,
      referencia_externa: externalReference
    };

    const questionnaire = parseJsonValue(body.cuestionario, "N/A");

    const folder = `dpr_api/${auth.asesor.id}/${Date.now()}`;

    const file_ine_f = await uploadBufferToCloudinary(files?.file_ine_f?.[0], folder);
    const file_ine_r = await uploadBufferToCloudinary(files?.file_ine_r?.[0], folder);
    const file_selfie = await uploadBufferToCloudinary(files?.file_selfie?.[0], folder);
    const file_comp_domicilio = await uploadBufferToCloudinary(files?.file_comp_domicilio?.[0], folder);
    const file_edocta = await uploadBufferToCloudinary(files?.file_edocta?.[0], folder);

    let solicitudId = null;
    let balanceBefore = 0;
    let balanceAfter = 0;

    await db.runTransaction(async (tx) => {
      const asesorSnap = await tx.get(auth.asesorRef);

      if (!asesorSnap.exists) {
        const error = new Error("El asesor no existe.");
        error.statusCode = 404;
        error.errorCode = "ASESOR_NOT_FOUND";
        throw error;
      }

      const asesorData = asesorSnap.data();
      balanceBefore = Number(asesorData.saldo || 0);
      balanceAfter = balanceBefore - inventory.precioVenta;

      if (balanceBefore < inventory.precioVenta) {
        const error = new Error("Saldo insuficiente.");
        error.statusCode = 402;
        error.errorCode = "INSUFFICIENT_BALANCE";
        throw error;
      }

      const solicitudRef = db.collection("solicitudes").doc();
      solicitudId = solicitudRef.id;

      tx.update(auth.asesorRef, {
        saldo: balanceAfter
      });

      tx.set(solicitudRef, {
        asesor_uid: auth.asesor.id,
        nombre_asesor: auth.asesor.email || auth.apiKeyData.asesor_email || "",

        tipo: inventory.serviceName,
        service_code: inventory.serviceCode,
        inventario_id: inventory.id,

        costo: inventory.precioVenta,
        costoPropio: inventory.costoPropio,

        estatus: "En Proceso",
        finalizado: false,
        fecha: FieldValue.serverTimestamp(),

        curp,
        nss,

        origen: "API",
        created_via: "api",
        api_key_id: auth.apiKeyId,
        api_key_prefix: auth.apiKeyPrefix,
        referencia_externa: externalReference,

        detalles_extra: details,
        cuestionario: questionnaire,

        file_ine_f,
        file_ine_r,
        file_selfie,
        file_comp_domicilio,
        file_edocta
      });
    });

    const n8nResult = await notifyN8n({
      id_solicitud: solicitudId,
      asesor: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      tramite: inventory.serviceName,
      curp,
      nss,
      extra: details,
      quest: questionnaire,
      file_ine_f,
      file_ine_r,
      file_selfie,
      file_comp_domicilio,
      file_edocta,
      origen: "API",
      referencia_externa: externalReference
    });

    await writeUsageLog({
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      api_key_id: auth.apiKeyId,
      key_prefix: auth.apiKeyPrefix,
      endpoint: "/api/v1/requests-with-files",
      method: "POST",
      status_code: 201,
      success: true,
      service_code: inventory.serviceCode,
      service_name: inventory.serviceName,
      solicitud_id: solicitudId,
      external_reference: externalReference,
      precio_venta: inventory.precioVenta,
      costo_propio: inventory.costoPropio,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      n8n_ok: n8nResult.ok,
      n8n_status: n8nResult.status,
      files_received: Object.keys(files),
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.status(201).json({
      success: true,
      solicitud_id: solicitudId,
      external_reference: externalReference,
      service_code: inventory.serviceCode,
      service_name: inventory.serviceName,
      estatus: "En Proceso",
      costo: inventory.precioVenta,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      files: {
        file_ine_f,
        file_ine_r,
        file_selfie,
        file_comp_domicilio,
        file_edocta
      }
    });
  } catch (error) {
    console.error(error);

    if (auth) {
      await writeUsageLog({
        asesor_uid: auth.asesor?.id || auth.apiKeyData?.asesor_uid || null,
        asesor_email: auth.asesor?.email || auth.apiKeyData?.asesor_email || "",
        api_key_id: auth.apiKeyId,
        key_prefix: auth.apiKeyPrefix,
        endpoint: "/api/v1/requests-with-files",
        method: "POST",
        status_code: error.statusCode || 500,
        success: false,
        service_code: inventory?.serviceCode || normalizeString(body?.service_code).toUpperCase() || null,
        service_name: inventory?.serviceName || null,
        solicitud_id: null,
        external_reference: externalReference,
        precio_venta: inventory?.precioVenta || null,
        costo_propio: inventory?.costoPropio || null,
        error_code: error.errorCode || "INTERNAL_ERROR",
        error_message: error.message || "Error interno.",
        files_received: Object.keys(files || {}),
        ip: getRequestIp(req),
        user_agent: req.headers["user-agent"] || null
      });
    }

    sendError(res, error);
  }
});

app.get("/api/v1/requests/:id", async (req, res) => {
  try {
    const auth = await authenticateApiKey(req, "requests:read");

    const solicitudId = normalizeString(req.params.id);
    const snap = await db.collection("solicitudes").doc(solicitudId).get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        error_code: "REQUEST_NOT_FOUND",
        message: "Solicitud no encontrada."
      });
    }

    const solicitud = snap.data();

    if (solicitud.asesor_uid !== auth.asesor.id) {
      return res.status(403).json({
        success: false,
        error_code: "REQUEST_FORBIDDEN",
        message: "Esta solicitud no pertenece al asesor de la API Key."
      });
    }

    await writeUsageLog({
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      api_key_id: auth.apiKeyId,
      key_prefix: auth.apiKeyPrefix,
      endpoint: "/api/v1/requests/:id",
      method: "GET",
      status_code: 200,
      success: true,
      solicitud_id: solicitudId,
      external_reference: solicitud.referencia_externa || null,
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.json({
      success: true,
      solicitud_id: solicitudId,
      external_reference: solicitud.referencia_externa || null,
      service_code: solicitud.service_code || null,
      service_name: solicitud.tipo || null,
      estatus: solicitud.estatus || null,
      finalizado: solicitud.finalizado === true,
      archivoFinal: solicitud.archivoFinal || null,
      error: solicitud.error || null,
      created_via: solicitud.created_via || null,
      origen: solicitud.origen || null
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/requests/:id/result", async (req, res) => {
  try {
    const auth = await authenticateApiKey(req, "requests:read");

    const solicitudId = normalizeString(req.params.id);
    const snap = await db.collection("solicitudes").doc(solicitudId).get();

    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        error_code: "REQUEST_NOT_FOUND",
        message: "Solicitud no encontrada."
      });
    }

    const solicitud = snap.data();

    if (solicitud.asesor_uid !== auth.asesor.id) {
      return res.status(403).json({
        success: false,
        error_code: "REQUEST_FORBIDDEN",
        message: "Esta solicitud no pertenece al asesor de la API Key."
      });
    }

    if (!solicitud.archivoFinal) {
      return res.status(404).json({
        success: false,
        error_code: "RESULT_NOT_READY",
        message: "El resultado todavía no está disponible."
      });
    }

    await writeUsageLog({
      asesor_uid: auth.asesor.id,
      asesor_email: auth.asesor.email || auth.apiKeyData.asesor_email || "",
      api_key_id: auth.apiKeyId,
      key_prefix: auth.apiKeyPrefix,
      endpoint: "/api/v1/requests/:id/result",
      method: "GET",
      status_code: 200,
      success: true,
      solicitud_id: solicitudId,
      external_reference: solicitud.referencia_externa || null,
      ip: getRequestIp(req),
      user_agent: req.headers["user-agent"] || null
    });

    res.json({
      success: true,
      solicitud_id: solicitudId,
      external_reference: solicitud.referencia_externa || null,
      estatus: solicitud.estatus || null,
      finalizado: solicitud.finalizado === true,
      archivoFinal: solicitud.archivoFinal
    });
  } catch (error) {
    sendError(res, error);
  }
});

exports.api = onRequest(
  {
    region: "us-central1",
    secrets: [
      "DPR_ADMIN_TOKEN",
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY"
    ],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  app
);
