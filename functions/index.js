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

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
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

  let res = null;

  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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
  } catch (error) {
    const requestError = new Error(`No se pudo conectar a Supabase: ${error.message}`);
    requestError.statusCode = 500;
    requestError.errorCode = "SUPABASE_FETCH_FAILED";
    throw requestError;
  }

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
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
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
    archivoFinal: resolveArchivoFinal(row),
    fecha: row.fecha || row.created_at || null,
    detalles_extra: row.detalles_extra || {},
    cuestionario: row.cuestionario || {},
    descargado_cliente: raw.descargado_cliente === true
  };
}

function mapSupabaseAdminSolicitud(row) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  return {
    ...raw,
    id: row.firebase_id || row.id,
    supabase_id: row.id,
    firebase_id: row.firebase_id || "",
    asesor_uid: row.firebase_uid,
    firebase_uid: row.firebase_uid,
    nombre_asesor: row.email || raw.nombre_asesor || raw.email || "",
    email: row.email || raw.email || "",
    tipo: row.tipo || raw.tipo || "",
    costo: Number(row.costo || raw.costo || 0),
    estatus: row.estatus || raw.estatus || "",
    finalizado: row.finalizado === true || raw.finalizado === true,
    reembolsado: row.reembolsado === true || raw.reembolsado === true,
    monto_reembolsado: Number(row.monto_reembolsado || raw.monto_reembolsado || 0),
    curp: row.curp || raw.curp || "",
    nss: row.nss || raw.nss || "",
    archivoFinal: resolveArchivoFinal(row),
    fecha: row.fecha || row.created_at || raw.fecha || null,
    fecha_terminado: raw.fecha_terminado || raw.fechaTerminado || null,
    fecha_finalizado: raw.fecha_finalizado || null,
    detalles_extra: row.detalles_extra || raw.detalles_extra || {},
    cuestionario: row.cuestionario || raw.cuestionario || {},
    origen: raw.origen || "Portal"
  };
}

function isMeaningfulAdminSolicitud(row) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  const values = [
    row.tipo,
    row.email,
    row.curp,
    row.nss,
    raw.tipo,
    raw.email,
    raw.nombre_asesor,
    raw.nombre_cliente,
    raw.curp,
    raw.nss
  ];
  return values.some((value) => {
    const text = normalizeString(value);
    return text && text !== "N/A" && text !== "..." && text.toUpperCase() !== "S/N";
  });
}

function mapSupabaseRecharge(row) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  return {
    id: row.firebase_id || row.id,
    uid: row.firebase_uid || raw.uid || raw.asesor_uid || "",
    asesor_uid: row.firebase_uid || raw.asesor_uid || raw.uid || "",
    asesorEmail: row.email || raw.asesorEmail || raw.email || "",
    email: row.email || raw.email || raw.asesorEmail || "",
    monto: Number(row.monto || 0),
    rastreo: row.rastreo || raw.rastreo || "",
    comprobante: row.comprobante_url || raw.comprobante || raw.comprobante_url || "",
    estatus: row.estatus || raw.estatus || "pendiente",
    fecha: row.fecha || row.created_at || raw.fecha || null
  };
}

function isMeaningfulRecharge(row) {
  const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  const monto = Number(row.monto || raw.monto || 0);
  const rastreo = normalizeString(row.rastreo || raw.rastreo).toUpperCase();
  const email = normalizeString(row.email || raw.email || raw.asesorEmail);
  const comprobante = normalizeString(row.comprobante_url || raw.comprobante || raw.comprobante_url);
  const hasReference = rastreo && rastreo !== "N/A" && rastreo !== "..." && rastreo !== "S/N";
  const hasOwner = email && email !== "N/A" && email !== "..." && email.toUpperCase() !== "S/N";
  return Number.isFinite(monto) && monto > 0 && (hasReference || hasOwner || comprobante);
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
  SINDO_ALFANUMERICO: "SINDO ALFANUMÃ‰RICO",
  SINDO_SALARIO_PROMEDIO: "SINDO SALARIO PROMEDIO",
  SINDO_VIGENCIA: "SINDO VIGENCIA",
  SINDO_COMPLETO: "SINDO COMPLETO",

  TARJETA_NSS: "Tarjeta NSS",
  VIGENCIA_DERECHOS: "Vigencia de Derechos",
  INCAPACIDAD: "Incapacidad",
  RECETAS: "Recetas",
  INSCRIPCION_MODALIDAD_10: "InscripciÃ³n Modalidad 10",
  ALTA_MENSUAL: "Alta Mensual",
  ALTA_DESEMPLEO_LINEA_CAPTURA: "Alta Para Desempleo con linea de captura",
  ALTA_DESEMPLEO_APORTACIONES: "Alta para Desempleo con aportaciones",

  RFC_CLON: "RFC Clon",
  RFC_VERIFICABLE: "RFC Verificable",
  RFC_IDCIF: "RFC con IDCIF",
  RFC_ORIGINAL: "RFC Original",
  LOCALIZACION_IDCIF: "LocalizaciÃ³n de IDcif",

  BURO_CREDITO: "BurÃ³ de CrÃ©dito",
  CURP: "CURP",
  RECIBO_CFE: "Recibo CFE",
  ACTA_NACIMIENTO: "Acta de Nacimiento",
  ACTA_MATRIMONIO: "Acta de Matrimonio",
  ACTA_DIVORCIO: "Acta de Divorcio",
  ACTA_DEFUNCION: "Acta de DefunciÃ³n",

  LOCALIZACION_CONTRASENA_INFONAVIT: "LocalizaciÃ³n de ContraseÃ±a",
  RESETEO_INFONAVIT: "Reseteo Cuenta",
  PRECALIFICACION_MEJORAVIT: "PrecalificaciÃ³n Mejoravit",
  PRECALIFICACION_LINEA_II: "PrecalificaciÃ³n Linea II",
  CREAR_CUENTA_INFONAVIT: "CREAR CUENTA EN MI CUENTAINFONAVIT",
  HISTORICO_INFONAVIT: "HistÃ³rico Infonavit",

  REGISTRO_AFORE_DISTANCIA: "Registro a Distancia",
  RETIRO_DESEMPLEO_AFORE: "Retiro Desempleo a Distancia",
  CAMBIO_CONTRASENA_AFORE: "Cambiar ContraseÃ±a AFORE Web",
  ESTADO_CUENTA_AFORE_AZTECA: "Estado de cuenta AFORE - Azteca",
  ESTADO_CUENTA_AFORE_COPPEL: "Estado de cuenta AFORE - Coppel",
  ESTADO_CUENTA_AFORE_PROFUTURO: "Estado de cuenta AFORE - Profuturo",
  ESTADO_CUENTA_AFORE_INVERCAP: "Estado de cuenta AFORE - Invercap",
  ESTADO_CUENTA_AFORE_SURA: "Estado de cuenta AFORE - Sura",
  ESTADO_CUENTA_AFORE_BANORTE: "Estado de cuenta AFORE - Banorte",
  ESTADO_CUENTA_AFORE_PRINCIPAL: "Estado de cuenta AFORE - Principal",
  ESTADO_CUENTA_AFORE_BANAMEX: "Estado de cuenta AFORE - Banamex",

  ANALISIS_RAPIDO_PENSION: "AnÃ¡lisis rÃ¡pido de pensiÃ³n",
  ANALISIS_DETALLADO_PENSION: "AnÃ¡lisis Detallado de pensiÃ³n",

  // Alias legacy temporales para no romper integraciones anteriores.
  VIGENCIA: "Vigencia de Derechos",
  ALTA_DESEMPLEO: "Alta para Desempleo con aportaciones",
  RETIRO: "Retiro Desempleo a Distancia",
  CONTRASENA: "Cambiar ContraseÃ±a AFORE Web",
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
  BURO_CREDITO: ["DPR BURÃ“ DE CREDITO"],
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
  "DESCARGA DE CARTILLA": 20,
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
  "LOCALIZAR CONTRASENA": 70,
  "RESUMEN DE SALDOS": 170,
  "LOCALIZA TU AFORE": 29,
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

const DASHBOARD_AFORE_OPTIONS = [
  { nombre: "Azteca", precio: 0 },
  { nombre: "Coppel", precio: 0 },
  { nombre: "Invercap", precio: 0 },
  { nombre: "SURA", precio: 0 },
  { nombre: "BANORTE", precio: 0 },
  { nombre: "Principal", precio: 0 },
  { nombre: "Banamex", precio: 0 }
];

const DASHBOARD_SERVICE_CATALOG = {
  IMSS: [
    { nombre: "SEMANAS COTIZADAS", precio: 0, nss: true, curp: true },
    { nombre: "SEMANAS DETALLADAS", precio: 0, nss: true, curp: true },
    { nombre: "SINDO ULTIMO RETIRO", precio: 0, nss: true },
    { nombre: "SINDO ALFANUMERICO", precio: 0, nss: true, pideNombre: true, curp: true },
    { nombre: "SINDO COMPLETO", precio: 0, nss: true },
    { nombre: "SINDO SALARIO PROMEDIO", precio: 0, nss: true },
    { nombre: "SINDO VIGENCIA", precio: 0, nss: true },
    { nombre: "Tarjeta NSS", precio: 0, nss: true, curp: true },
    { nombre: "Descarga de Cartilla", precio: 0, pideNombre: true, curp: true, nss: true },
    { nombre: "Vigencia de Derechos", precio: 0, curp: true, nss: true },
    { nombre: "Incapacidad", precio: 0, curp: true, nss: true, pideNombre: true, pideTurno: true, pideDelegacion: true, pideClinica: true, pideConsultorio: true, pideFecha: true, pidePatron: true, pidePuesto: true, pideDiasIncapacidad: true },
    { nombre: "Recetas", precio: 0, curp: true, nss: true, pideNombre: true, pideDelegacion: true, pideClinica: true, pideConsultorio: true, pideFecha: true },
    { nombre: "Inscripcion Modalidad 10", precio: 0, nss: true, rfc: true, pideNombre: true, pideCalle: true, pideColonia: true, pideMunicipio: true, pideEstado: true, pideCP: true, pideTel: true, pideCorreo: true, pideOcupacion: true, pideSalarioMensual: true, pidePeriodicidadPago: true, notaLineaCaptura: true },
    { nombre: "Alta Mensual", precio: 0, nss: true, curp: true, pideNombre: true },
    { nombre: "Alta Para Desempleo con linea de captura", precio: 0, nss: true, curp: true, pideNombre: true },
    { nombre: "Alta para Desempleo con aportaciones", precio: 0, nss: true, curp: true, pideNombre: true }
  ],
  SAT: [
    { nombre: "RFC Clon", precio: 0, curp: true },
    { nombre: "RFC Verificable", precio: 0, curp: true },
    { nombre: "RFC con IDCIF", precio: 0, rfc: true, idcif: true },
    { nombre: "RFC Original", precio: 0, curp: true },
    { nombre: "Localizacion de IDcif", precio: 0, rfc: true }
  ],
  DOC: [
    { nombre: "Buro de Credito", precio: 0, curp: true, pideIneFrente: true },
    { nombre: "CURP", precio: 0, curp: true },
    { nombre: "Recibo CFE", precio: 0, pideNumServicio: true },
    { nombre: "Acta de Nacimiento", precio: 0, curp: true },
    { nombre: "Acta de Matrimonio", precio: 0, curp: true },
    { nombre: "Acta de Divorcio", precio: 0, curp: true },
    { nombre: "Acta de Defuncion", precio: 0, curp: true },
    { nombre: "Certificado INEA", precio: 0, pideNombre: true, curp: true, pideDia: true, pideMes: true, pideAnio: true, pideNivelEducativo: true, pidePromedio: true, pideEstado: true },
    { nombre: "Certificado COVID", precio: 0, pideNombre: true, curp: true, pideVacunaCovid: true }
  ],
  INF: [
    { nombre: "Localizacion de Contrasena", precio: 0, nss: true, pideFecha: true },
    { nombre: "Reseteo Cuenta", precio: 0, nss: true, pideFecha: true },
    { nombre: "Precalificacion Mejoravit", precio: 0, nss: true, pideFecha: true },
    { nombre: "Precalificacion Linea II", precio: 0, nss: true, pideFecha: true },
    { nombre: "CREAR CUENTA EN MI CUENTAINFONAVIT", precio: 0, curp: true, nss: true, pideFecha: true, pideTelContacto: true, pideCorreo: true, pideNota: true, rfc: true },
    { nombre: "Historico Infonavit", precio: 0, nss: true, pideFecha: true }
  ],
  AFORE: [
    { nombre: "Registro a Distancia", precio: 0, pideIneFrente: true, pideIneReverso: true, pideFotoCli: true, pideTel: true, pideTelContacto: true, pideCorreo: true, pideNota: true },
    { nombre: "Retiro Desempleo a Distancia", precio: 0, pideIneFrente: true, pideIneReverso: true, pideEdoCta: true, pideFotoCli: true, pidePass: true },
    { nombre: "Cambiar Contrasena AFORE Web", precio: 0, curp: true, pidePassNueva: true, pideFotoCli: true },
    { nombre: "Estado de cuenta AFORE", precio: 0, pideNombre: true, nss: true, curp: true, pideAforeTipo: true },
    { nombre: "Localizar Contrasena", precio: 0, curp: true, extraMsg: "El usuario debe estar registrado en AFORE Movil o AFORE Web." },
    { nombre: "Resumen de Saldos", precio: 0, curp: true, extraMsg: "Si el cliente no cuenta con registro en AFORE Movil o AFORE Web, se dara una contrasena generica." },
    { nombre: "Localiza tu AFORE", precio: 0, curp: true }
  ],
  PENSIONES: [
    { nombre: "Analisis rapido de pension", precio: 0, curp: true, nss: true },
    { nombre: "Analisis Detallado de pension", precio: 0, pideCuestionarioPension: true }
  ]
};

function normalizeString(value) {
  return String(value || "").trim();
}

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.ip ||
    null
  );
}

async function authenticateFirebaseUser(req) {
  const authHeader = req.headers["authorization"] || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    const error = new Error("Falta token de sesiÃ³n.");
    error.statusCode = 401;
    error.errorCode = "FIREBASE_TOKEN_REQUIRED";
    throw error;
  }

  let decoded = null;

  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    const authError = new Error("Token de sesiÃ³n invÃ¡lido.");
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

async function authenticateFirebaseUserToken(req) {
  const authHeader = req.headers["authorization"] || "";
  const idToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!idToken) {
    const error = new Error("Falta token de sesion.");
    error.statusCode = 401;
    error.errorCode = "FIREBASE_TOKEN_REQUIRED";
    throw error;
  }

  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    const authError = new Error("Token de sesion invalido.");
    authError.statusCode = 401;
    authError.errorCode = "INVALID_FIREBASE_TOKEN";
    throw authError;
  }
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
    const error = new Error("El servicio no tiene precioVenta vÃ¡lido.");
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
    const error = new Error("Cloudinary no estÃ¡ configurado en secretos de Functions.");
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

async function uploadRemoteUrlToCloudinary(fileUrl, folder) {
  const url = normalizeString(fileUrl);

  if (!/^https?:\/\//i.test(url)) {
    const error = new Error("La URL del documento no es valida.");
    error.statusCode = 400;
    error.errorCode = "INVALID_REMOTE_FILE_URL";
    throw error;
  }

  let response = null;

  try {
    response = await fetch(url);
  } catch (error) {
    const requestError = new Error(`No se pudo descargar el documento remoto: ${error.message}`);
    requestError.statusCode = 502;
    requestError.errorCode = "REMOTE_FILE_FETCH_FAILED";
    throw requestError;
  }

  if (!response.ok) {
    const error = new Error(`No se pudo descargar el documento remoto: ${response.status}`);
    error.statusCode = 502;
    error.errorCode = "REMOTE_FILE_FETCH_FAILED";
    throw error;
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = 25 * 1024 * 1024;

  if (contentLength > maxBytes) {
    const error = new Error("El documento remoto excede el limite de 25 MB.");
    error.statusCode = 413;
    error.errorCode = "REMOTE_FILE_TOO_LARGE";
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    const error = new Error("El documento remoto esta vacio.");
    error.statusCode = 400;
    error.errorCode = "REMOTE_FILE_EMPTY";
    throw error;
  }

  if (buffer.length > maxBytes) {
    const error = new Error("El documento remoto excede el limite de 25 MB.");
    error.statusCode = 413;
    error.errorCode = "REMOTE_FILE_TOO_LARGE";
    throw error;
  }

  return uploadBufferToCloudinary({ buffer }, folder);
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
      const error = new Error("No se recibiÃ³ rawBody para procesar multipart/form-data.");
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
          const error = new Error(`El archivo ${filename} excede el tamaÃ±o permitido.`);
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
    const payloadCompleto = {
      ...payload,
      body: payload,
      source: "novyra-backend",
      sent_at: new Date().toISOString()
    };
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadCompleto)
    });
    const responseText = await response.text().catch(() => "");

    return {
      ok: response.ok,
      status: response.status,
      response: responseText.slice(0, 1000)
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

function buildN8nSolicitudPayload(row, origen = "dashboard") {
  const raw = row?.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  return {
    id_solicitud: row?.firebase_id || row?.id || raw.id_solicitud || "",
    asesor: row?.email || raw.email || raw.asesor || raw.nombre_asesor || "",
    tramite: row?.tipo || raw.tipo || "",
    curp: normalizeString(row?.curp || raw.curp || "N/A") || "N/A",
    nss: normalizeString(row?.nss || raw.nss || "N/A") || "N/A",
    extra: row?.detalles_extra || raw.detalles_extra || raw.extra || {},
    quest: row?.cuestionario || raw.cuestionario || raw.quest || "N/A",
    file_ine_f: normalizeString(raw.file_ine_f || "N/A") || "N/A",
    file_ine_r: normalizeString(raw.file_ine_r || "N/A") || "N/A",
    file_selfie: normalizeString(raw.file_selfie || "N/A") || "N/A",
    file_comp_domicilio: normalizeString(raw.file_comp_domicilio || "N/A") || "N/A",
    file_edocta: normalizeString(raw.file_edocta || "N/A") || "N/A",
    origen
  };
}

function sendError(res, error) {
  const statusCode = error.statusCode || 500;
  const payload = {
    success: false,
    error_code: error.errorCode || "INTERNAL_ERROR",
    message: error.message || "Error interno."
  };

  if (error.details) payload.details = error.details;
  return res.status(statusCode).json(payload);
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

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function staffSessionSecret() {
  const secret = process.env.DPR_ADMIN_TOKEN || SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    const error = new Error("No esta configurado el secreto de sesiones internas.");
    error.statusCode = 500;
    error.errorCode = "STAFF_SECRET_NOT_CONFIGURED";
    throw error;
  }
  return secret;
}

function signStaffSession(payload) {
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const body = base64UrlEncode(payload);
  const signature = crypto
    .createHmac("sha256", staffSessionSecret())
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${body}.${signature}`;
}

function verifyStaffSessionToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    const error = new Error("Sesion interna invalida.");
    error.statusCode = 401;
    error.errorCode = "INVALID_STAFF_TOKEN";
    throw error;
  }

  const expected = crypto
    .createHmac("sha256", staffSessionSecret())
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(parts[2]);
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    const error = new Error("Sesion interna invalida.");
    error.statusCode = 401;
    error.errorCode = "INVALID_STAFF_TOKEN";
    throw error;
  }

  const payload = base64UrlDecode(parts[1]);
  if (!payload.exp || Date.now() > Number(payload.exp)) {
    const error = new Error("Sesion interna expirada. Inicia sesion nuevamente.");
    error.statusCode = 401;
    error.errorCode = "STAFF_TOKEN_EXPIRED";
    throw error;
  }
  return payload;
}

function validateStaffOrAdmin(req) {
  const adminToken = req.headers["x-admin-token"];
  if (process.env.DPR_ADMIN_TOKEN && adminToken === process.env.DPR_ADMIN_TOKEN) {
    return { role: "admin", username: "admin", name: "Administrador" };
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("Falta token interno.");
    error.statusCode = 401;
    error.errorCode = "STAFF_TOKEN_REQUIRED";
    throw error;
  }
  return verifyStaffSessionToken(token);
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

async function getSupabaseRechargeByPanelId(id) {
  const encodedId = supabaseEq(id);
  let rows = await supabaseRequest(
    `notificaciones_pago?firebase_id=eq.${encodedId}&select=*&limit=1`
  );
  if (rows?.[0]) return rows[0];

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
    rows = await supabaseRequest(
      `notificaciones_pago?id=eq.${encodedId}&select=*&limit=1`
    );
  }
  return rows?.[0] || null;
}

function supabaseRechargeFilterByPanelId(id) {
  const encodedId = supabaseEq(id);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
    return `or=(firebase_id.eq.${encodedId},id.eq.${encodedId})`;
  }
  return `firebase_id=eq.${encodedId}`;
}

app.get("/api/v1/admin/panel/recharges", async (req, res) => {
  try {
    validateAdminToken(req);
    const limitValue = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const rows = await supabaseRequest(
      `notificaciones_pago?select=*&order=fecha.desc&limit=${limitValue}`
    );

    res.json({
      success: true,
      rows: (rows || []).filter(isMeaningfulRecharge).map(mapSupabaseRecharge)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/admin/panel/staff-login", async (req, res) => {
  try {
    const username = normalizeString(req.body?.username);
    const password = normalizeString(req.body?.password);

    if (!username || !password) {
      const error = new Error("Escribe usuario y contrasena.");
      error.statusCode = 400;
      error.errorCode = "STAFF_LOGIN_REQUIRED";
      throw error;
    }

    let staff = null;

    if (username === "admin" && password === "Admin2026*") {
      staff = {
        username: "admin",
        role: "admin",
        name: "Administrador DPR",
        tramitesPermitidos: ["TODO"]
      };
    } else {
      const snap = await db.collection("accesos_crm").where("username", "==", username).limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data() || {};
        if (String(data.password || "") === password && data.activo !== false) {
          staff = {
            uid: snap.docs[0].id,
            username: data.username || username,
            role: data.role || data.area || "asesor",
            name: data.nombre || data.name || data.username || username,
            tramitesPermitidos: Array.isArray(data.tramitesPermitidos) ? data.tramitesPermitidos : []
          };
        }
      }
    }

    if (!staff) {
      const error = new Error("Usuario o contrasena incorrectos.");
      error.statusCode = 401;
      error.errorCode = "INVALID_STAFF_LOGIN";
      throw error;
    }

    const expiresAt = Date.now() + (12 * 60 * 60 * 1000);
    const token = signStaffSession({
      ...staff,
      exp: expiresAt,
      iat: Date.now()
    });

    res.json({
      success: true,
      token,
      staff: {
        ...staff,
        loginAt: new Date().toISOString()
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/v1/admin/panel/recharges/:id", async (req, res) => {
  try {
    validateAdminToken(req);
    const id = req.params.id;
    const recharge = await getSupabaseRechargeByPanelId(id);

    if (!recharge) {
      const error = new Error("Recarga no encontrada.");
      error.statusCode = 404;
      error.errorCode = "RECHARGE_NOT_FOUND";
      throw error;
    }

    if (normalizeForCompare(recharge.estatus).includes("aprob")) {
      const error = new Error("No se puede borrar una recarga aprobada.");
      error.statusCode = 400;
      error.errorCode = "APPROVED_RECHARGE_DELETE_BLOCKED";
      throw error;
    }

    await supabaseRequest(`notificaciones_pago?${supabaseRechargeFilterByPanelId(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/admin/panel/recharges/:id/approve", async (req, res) => {
  try {
    validateAdminToken(req);
    const id = req.params.id;
    const recharge = await getSupabaseRechargeByPanelId(id);

    if (!recharge) {
      const error = new Error("Recarga no encontrada.");
      error.statusCode = 404;
      error.errorCode = "RECHARGE_NOT_FOUND";
      throw error;
    }

    if (normalizeForCompare(recharge.estatus).includes("aprob")) {
      res.json({
        success: true,
        already_approved: true,
        monto: Number(recharge.monto || 0)
      });
      return;
    }

    const monto = Number(recharge.monto || 0);
    if (!Number.isFinite(monto) || monto <= 0) {
      const error = new Error("Monto de recarga invalido.");
      error.statusCode = 400;
      error.errorCode = "INVALID_RECHARGE_AMOUNT";
      throw error;
    }

    const rastreo = normalizeString(recharge.rastreo).toUpperCase();
    if (rastreo) {
      const aprobadasMismoRastreo = await supabaseRequest(
        `notificaciones_pago?rastreo=eq.${supabaseEq(rastreo)}&estatus=ilike.*aprob*&select=id,firebase_id,email,monto&limit=5`
      );
      const duplicada = (aprobadasMismoRastreo || []).find((row) => {
        return String(row.id) !== String(recharge.id) && String(row.firebase_id || "") !== String(recharge.firebase_id || "");
      });
      if (duplicada) {
        const error = new Error(`Ya existe una recarga aprobada con ese rastreo (${rastreo}).`);
        error.statusCode = 409;
        error.errorCode = "DUPLICATE_APPROVED_TRACKING";
        throw error;
      }
    }

    const uid = recharge.firebase_uid || recharge.raw_data?.uid || recharge.raw_data?.asesor_uid || "";
    if (!uid) {
      const error = new Error("La recarga no tiene UID de asesor.");
      error.statusCode = 400;
      error.errorCode = "RECHARGE_UID_MISSING";
      throw error;
    }

    const asesor = await getSupabaseAsesorByUid(uid);
    if (!asesor) {
      const error = new Error("No se encontro el asesor de la recarga.");
      error.statusCode = 404;
      error.errorCode = "ASESOR_NOT_FOUND";
      throw error;
    }

    const saldoAntes = Number(asesor.saldo_actual || 0);
    const saldoDespues = saldoAntes + monto;
    const now = new Date().toISOString();
    const raw = recharge.raw_data && typeof recharge.raw_data === "object" ? recharge.raw_data : {};

    await supabaseRequest(`asesores?firebase_uid=eq.${supabaseEq(uid)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ saldo_actual: saldoDespues })
    });

    await supabaseRequest(`notificaciones_pago?${supabaseRechargeFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        estatus: "aprobado",
        raw_data: {
          ...raw,
          aprobado: true,
          fecha_aprobacion: now,
          aprobado_por: "admin_panel",
          saldo_anterior: saldoAntes,
          saldo_nuevo: saldoDespues
        }
      })
    });

    await insertSupabaseMovimientoSaldo({
      firebase_uid: uid,
      email: recharge.email || asesor.email || raw.asesorEmail || "",
      tipo: "recarga",
      monto,
      saldo_antes: saldoAntes,
      saldo_despues: saldoDespues,
      descripcion: rastreo ? `Recarga aprobada: ${rastreo}` : "Recarga aprobada",
      referencia_tipo: "notificacion_pago",
      referencia_id: recharge.firebase_id || recharge.id,
      origen: "admin_panel",
      fecha_movimiento: now
    });

    res.json({
      success: true,
      monto,
      saldo_anterior: saldoAntes,
      saldo_nuevo: saldoDespues
    });
  } catch (error) {
    sendError(res, error);
  }
});

async function getSupabaseSolicitudByPanelId(id) {
  const encodedId = supabaseEq(id);
  let rows = await supabaseRequest(
    `solicitudes?firebase_id=eq.${encodedId}&select=*&limit=1`
  );
  if (rows?.[0]) return rows[0];

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
    rows = await supabaseRequest(
      `solicitudes?id=eq.${encodedId}&select=*&limit=1`
    );
  }
  return rows?.[0] || null;
}

function supabaseSolicitudFilterByPanelId(id) {
  const encodedId = supabaseEq(id);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
    return `or=(firebase_id.eq.${encodedId},id.eq.${encodedId})`;
  }
  return `firebase_id=eq.${encodedId}`;
}

app.get("/api/v1/admin/panel/requests", async (req, res) => {
  try {
    validateStaffOrAdmin(req);
    const limitValue = Math.min(Math.max(Number(req.query.limit || 3500), 1), 6000);
    const batchSize = 750;
    const rows = [];

    for (let from = 0; from < limitValue; from += batchSize) {
      const batchLimit = Math.min(batchSize, limitValue - from);
      const batch = await supabaseRequest(
        `solicitudes?select=*&order=fecha.desc&limit=${batchLimit}&offset=${from}`
      );

      const batchRows = Array.isArray(batch) ? batch : [];
      rows.push(...batchRows);

      if (batchRows.length < batchLimit) break;
    }

    const pendingRows = await supabaseRequest(
      "solicitudes?select=*&or=(estatus.ilike.en%20proceso,estatus.ilike.pendiente,estatus.ilike.procesando)&order=fecha.desc&limit=3000"
    );

    const byId = new Map();
    [...rows, ...(Array.isArray(pendingRows) ? pendingRows : [])].forEach((row) => {
      const key = String(row.firebase_id || row.id || "");
      if (key) byId.set(key, row);
    });

    const mergedRows = Array.from(byId.values()).sort((a, b) => {
      const dateA = new Date(a.fecha || a.created_at || a.fecha_creacion || 0).getTime();
      const dateB = new Date(b.fecha || b.created_at || b.fecha_creacion || 0).getTime();
      return dateB - dateA;
    });

    res.json({
      success: true,
      requested_limit: limitValue,
      loaded_count: mergedRows.length,
      requests: mergedRows.filter(isMeaningfulAdminSolicitud).map(mapSupabaseAdminSolicitud)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/admin/panel/requests/:id/status", async (req, res) => {
  try {
    validateStaffOrAdmin(req);
    const id = req.params.id;
    const solicitud = await getSupabaseSolicitudByPanelId(id);

    if (!solicitud) {
      const error = new Error("Solicitud no encontrada.");
      error.statusCode = 404;
      error.errorCode = "REQUEST_NOT_FOUND";
      throw error;
    }

    const body = req.body || {};
    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    const incomingRaw = body.raw_data && typeof body.raw_data === "object" ? body.raw_data : {};
    const now = new Date().toISOString();
    const finalizado = body.finalizado === true;

    const payload = {
      raw_data: {
        ...currentRaw,
        ...incomingRaw,
        actualizado_admin: now
      }
    };

    if (body.estatus !== undefined) payload.estatus = normalizeString(body.estatus);
    if (body.finalizado !== undefined) payload.finalizado = finalizado;
    const archivoFinalAdmin = normalizeString(getN8nBodyField(body, [
      "archivo_final",
      "archivoFinal",
      "archivoUrl",
      "document_url",
      "documentUrl",
      "url",
      "link"
    ]));
    if (archivoFinalAdmin) {
      payload.archivo_final = archivoFinalAdmin;
      payload.raw_data.archivoFinal = archivoFinalAdmin;
      payload.raw_data.archivo_final = archivoFinalAdmin;
    }
    if (finalizado) {
      payload.raw_data.fecha_terminado = payload.raw_data.fecha_terminado || now;
      payload.raw_data.fecha_finalizado = payload.raw_data.fecha_finalizado || now;
    }

    await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload)
    });

    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/admin/panel/requests/:id/resend-n8n", async (req, res) => {
  try {
    validateStaffOrAdmin(req);
    const id = req.params.id;
    const solicitud = await getSupabaseSolicitudByPanelId(id);

    if (!solicitud) {
      const error = new Error("Solicitud no encontrada.");
      error.statusCode = 404;
      error.errorCode = "REQUEST_NOT_FOUND";
      throw error;
    }

    const now = new Date().toISOString();
    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    const n8nResult = await notifyN8n(buildN8nSolicitudPayload(solicitud, "admin_panel_resend"));

    await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
          raw_data: {
            ...currentRaw,
            n8n_ok: n8nResult.ok,
            n8n_status: n8nResult.status,
            n8n_error: n8nResult.error || null,
            n8n_response: n8nResult.response || "",
            n8n_reenviado_admin: true,
            n8n_ultimo_envio: now
          }
        })
    });

    res.json({
      success: true,
      n8n_ok: n8nResult.ok,
      n8n_status: n8nResult.status,
      n8n_error: n8nResult.error || null
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/admin/panel/requests/:id/refund", async (req, res) => {
  try {
    validateStaffOrAdmin(req);
    const id = req.params.id;
    const solicitud = await getSupabaseSolicitudByPanelId(id);

    if (!solicitud) {
      const error = new Error("Solicitud no encontrada.");
      error.statusCode = 404;
      error.errorCode = "REQUEST_NOT_FOUND";
      throw error;
    }

    if (solicitud.reembolsado === true) {
      res.json({
        success: true,
        already_refunded: true,
        monto_reembolsado: Number(solicitud.monto_reembolsado || solicitud.costo || 0)
      });
      return;
    }

    const monto = Math.abs(Number(solicitud.costo || 0));
    const asesor = await getSupabaseAsesorByUid(solicitud.firebase_uid);

    if (!asesor) {
      const error = new Error("No se encontró el asesor para reembolsar.");
      error.statusCode = 404;
      error.errorCode = "ASESOR_NOT_FOUND";
      throw error;
    }

    const saldoAntes = Number(asesor.saldo_actual || 0);
    const saldoDespues = saldoAntes + monto;
    const now = new Date().toISOString();

    await supabaseRequest(`asesores?firebase_uid=eq.${supabaseEq(solicitud.firebase_uid)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ saldo_actual: saldoDespues })
    });

    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        reembolsado: true,
        monto_reembolsado: monto,
        raw_data: {
          ...currentRaw,
          reembolsado: true,
          monto_reembolsado: monto,
          fecha_reembolso: now,
          reembolso_origen: "admin_panel"
        }
      })
    });

    await insertSupabaseMovimientoSaldo({
      firebase_uid: solicitud.firebase_uid,
      email: solicitud.email || asesor.email || "",
      tipo: "reembolso",
      monto,
      saldo_antes: saldoAntes,
      saldo_despues: saldoDespues,
      descripcion: `Reembolso admin: ${solicitud.tipo || "tramite"}`,
      referencia_tipo: "solicitud",
      referencia_id: solicitud.firebase_id || solicitud.id,
      origen: "admin_panel",
      fecha_movimiento: now
    });

    res.json({
      success: true,
      monto_reembolsado: monto,
      saldo_anterior: saldoAntes,
      saldo_nuevo: saldoDespues
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/n8n/requests/:id/final-document", async (req, res) => {
  try {
    validateAdminToken(req);
    const id = req.params.id;
    const solicitud = await getSupabaseSolicitudByPanelId(id);

    if (!solicitud) {
      const error = new Error("Solicitud no encontrada.");
      error.statusCode = 404;
      error.errorCode = "REQUEST_NOT_FOUND";
      throw error;
    }

    const body = req.body || {};
    const archivoFinal = normalizeString(
      getN8nBodyField(body, [
        "archivo_final",
        "archivoFinal",
        "archivoUrl",
        "document_url",
        "documentUrl",
        "url",
        "link"
      ])
    );

    if (!archivoFinal) {
      const error = new Error("Falta la URL del documento final.");
      error.statusCode = 400;
      error.errorCode = "FINAL_DOCUMENT_URL_REQUIRED";
      throw error;
    }

    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    const estatus = normalizeString(body.estatus || "Terminado") || "Terminado";
    const now = new Date().toISOString();

    const updated = await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        archivo_final: archivoFinal,
        estatus,
        finalizado: true,
        raw_data: {
          ...currentRaw,
          archivoFinal,
          archivo_final: archivoFinal,
          n8n_documento_subido: true,
          n8n_fecha_documento: now,
          n8n_origen: normalizeString(body.origen || "n8n")
        }
      })
    });

    res.json({
      success: true,
      request: mapSupabaseAdminSolicitud(updated?.[0] || solicitud)
    });
  } catch (error) {
    sendError(res, error);
  }
});

function normalizeLookupValue(value) {
  return normalizeString(value)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function collectLookupValues(value, out = []) {
  if (value === null || value === undefined) return out;

  if (Array.isArray(value)) {
    value.forEach((item) => collectLookupValues(item, out));
    return out;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectLookupValues(item, out));
    return out;
  }

  const normalized = normalizeLookupValue(value);
  if (normalized && normalized !== "NA" && normalized !== "SN") out.push(normalized);
  return out;
}

function resolveArchivoFinal(row) {
  const raw = row?.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  const candidatos = [
    row?.archivo_final,
    raw.archivoFinal,
    raw.archivo_final,
    raw.archivoUrl,
    raw.document_url,
    raw.documentUrl,
    raw.url,
    raw.link
  ];

  for (const candidato of candidatos) {
    const url = normalizeString(candidato);
    if (/^https?:\/\//i.test(url)) return url;
    if (/^\/\//.test(url)) return `https:${url}`;
  }

  return "";
}

function getN8nBodyField(body, names) {
  const sources = [
    body,
    body?.body,
    body?.json,
    body?.data,
    body?.payload
  ].filter((source) => source && typeof source === "object");

  for (const source of sources) {
    for (const name of names) {
      if (source[name] !== undefined && source[name] !== null && normalizeString(source[name])) {
        return source[name];
      }
    }
  }

  return "";
}

function solicitudCoincideConDocumentoN8n(solicitud, body) {
  const raw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
  const detalles = solicitud.detalles_extra && typeof solicitud.detalles_extra === "object" ? solicitud.detalles_extra : {};
  const cuestionario = solicitud.cuestionario && typeof solicitud.cuestionario === "object" ? solicitud.cuestionario : {};
  const bolsa = {
    ...raw,
    ...detalles,
    ...cuestionario,
    curp: solicitud.curp || raw.curp || detalles.curp || cuestionario.curp,
    nss: solicitud.nss || raw.nss || detalles.nss || cuestionario.nss,
    rfc: solicitud.rfc || raw.rfc || detalles.rfc || cuestionario.rfc
  };

  const curp = normalizeLookupValue(getN8nBodyField(body, ["curp", "CURP"]));
  const rfc = normalizeLookupValue(getN8nBodyField(body, ["rfc", "RFC"]));
  const nss = normalizeLookupValue(getN8nBodyField(body, ["nss", "NSS"]));
  const valorDetectado = normalizeLookupValue(getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"]));
  const idCorto = normalizeLookupValue(getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"]));

  const valoresSolicitud = collectLookupValues(bolsa);

  if (curp && valoresSolicitud.includes(curp)) return true;
  if (rfc && valoresSolicitud.includes(rfc)) return true;
  if (nss && valoresSolicitud.includes(nss)) return true;
  if (valorDetectado && valoresSolicitud.includes(valorDetectado)) return true;
  if (idCorto && valoresSolicitud.some((value) => value.startsWith(idCorto) || value.includes(idCorto))) return true;
  return false;
}

app.post("/api/v1/n8n/final-document/import", async (req, res) => {
  try {
    validateAdminToken(req);

    const body = req.body || {};
    const archivoTemporal = normalizeString(
      getN8nBodyField(body, [
        "archivoUrl",
        "archivo_url",
        "downloadUrl",
        "download_url",
        "document_url",
        "documentUrl",
        "url",
        "link"
      ])
    );

    if (!archivoTemporal) {
      const error = new Error("Falta la URL temporal del documento.");
      error.statusCode = 400;
      error.errorCode = "REMOTE_DOCUMENT_URL_REQUIRED";
      throw error;
    }

    const hasSearchKey = [
      getN8nBodyField(body, ["curp", "CURP"]),
      getN8nBodyField(body, ["rfc", "RFC"]),
      getN8nBodyField(body, ["nss", "NSS"]),
      getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"]),
      getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"])
    ].some((value) => Boolean(normalizeString(value)));

    if (!hasSearchKey) {
      const error = new Error("Falta CURP, RFC, NSS o idCorto para localizar la solicitud.");
      error.statusCode = 400;
      error.errorCode = "N8N_LOOKUP_KEY_REQUIRED";
      throw error;
    }

    const rows = await supabaseRequest(
      "solicitudes?select=*&order=fecha.desc&limit=5000"
    );

    const candidatos = (rows || [])
      .filter(isMeaningfulAdminSolicitud)
      .filter((row) => {
        const estatus = normalizeForCompare(row.estatus || row.raw_data?.estatus || "");
        const archivoActual = normalizeString(row.archivo_final || row.raw_data?.archivo_final || row.raw_data?.archivoFinal);
        if (archivoActual) return false;
        if (row.finalizado === true && estatus.includes("termin")) return false;
        return solicitudCoincideConDocumentoN8n(row, body);
      });

    if (!candidatos.length) {
      const error = new Error("No se encontro una solicitud pendiente que coincida con el documento.");
      error.statusCode = 404;
      error.errorCode = "N8N_REQUEST_NOT_FOUND";
      error.details = {
        received: {
          curp: normalizeString(getN8nBodyField(body, ["curp", "CURP"])),
          rfc: normalizeString(getN8nBodyField(body, ["rfc", "RFC"])),
          nss: normalizeString(getN8nBodyField(body, ["nss", "NSS"])),
          valorDetectado: normalizeString(getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"])),
          idCorto: normalizeString(getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"]))
        },
        scanned: (rows || []).length
      };
      throw error;
    }

    if (candidatos.length > 1) {
      console.warn("n8n final-document import encontro multiples candidatos; se usara el mas reciente", {
        total: candidatos.length,
        ids: candidatos.slice(0, 5).map((row) => row.firebase_id || row.id)
      });
    }

    const archivoFinal = await uploadRemoteUrlToCloudinary(archivoTemporal, "novyra/documentos-finales");
    const solicitud = candidatos[0];
    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    const estatus = normalizeString(body.estatus || "Terminado") || "Terminado";
    const now = new Date().toISOString();
    const id = solicitud.firebase_id || solicitud.id;

    const updated = await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        archivo_final: archivoFinal,
        estatus,
        finalizado: true,
        raw_data: {
          ...currentRaw,
          archivoFinal,
          archivo_final: archivoFinal,
          archivo_url_temporal: archivoTemporal,
          n8n_documento_subido: true,
          n8n_cloudinary_import: true,
          n8n_fecha_documento: now,
          n8n_origen: normalizeString(body.origen || "n8n"),
          n8n_resuelto_por: {
            curp: normalizeString(getN8nBodyField(body, ["curp", "CURP"])),
            rfc: normalizeString(getN8nBodyField(body, ["rfc", "RFC"])),
            nss: normalizeString(getN8nBodyField(body, ["nss", "NSS"])),
            valorDetectado: normalizeString(getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"])),
            idCorto: normalizeString(getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"]))
          }
        }
      })
    });

    res.json({
      success: true,
      resolved_id: id,
      matched_count: candidatos.length,
      archivo_final: archivoFinal,
      request: mapSupabaseAdminSolicitud(updated?.[0] || solicitud)
    });
  } catch (error) {
    sendError(res, error);
  }
});

function getRemoteFinalDocumentCandidate(row) {
  const raw = row?.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  const candidatos = [
    raw.archivo_url_temporal,
    raw.archivoUrl,
    raw.downloadUrl,
    raw.download_url,
    raw.document_url,
    raw.documentUrl,
    raw.url,
    raw.link,
    row?.archivo_final,
    raw.archivoFinal,
    raw.archivo_final
  ];

  for (const candidato of candidatos) {
    const url = normalizeString(candidato);
    if (/^https?:\/\//i.test(url) && !/res\.cloudinary\.com/i.test(url)) return url;
  }

  return "";
}

app.post("/api/v1/admin/backfill-cloudinary-final-documents", async (req, res) => {
  try {
    validateAdminToken(req);

    const body = req.body || {};
    const dryRun = body.dry_run !== false;
    const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100);
    const startAfter = normalizeString(body.start_after || "");
    const dateFrom = normalizeString(body.date_from || "");
    const dateTo = normalizeString(body.date_to || "");
    const filter = [
      "select=*",
      "order=fecha.asc",
      `limit=${limit}`
    ];

    if (dateFrom) {
      filter.push(`fecha=gte.${encodeURIComponent(dateFrom)}`);
    }

    if (dateTo) {
      filter.push(`fecha=lt.${encodeURIComponent(dateTo)}`);
    }

    if (startAfter) {
      filter.push(`fecha=gt.${encodeURIComponent(startAfter)}`);
    }

    const rows = await supabaseRequest(`solicitudes?${filter.join("&")}`);
    const processed = [];
    const skipped = [];
    const errors = [];

    for (const row of rows || []) {
      const id = row.firebase_id || row.id;
      const currentFinal = resolveArchivoFinal(row);
      const remoteUrl = getRemoteFinalDocumentCandidate(row);
      const isCloudinary = /res\.cloudinary\.com/i.test(currentFinal);

      if (isCloudinary) {
        skipped.push({ id, email: row.email || "", reason: "ya_cloudinary", archivo_final: currentFinal });
        continue;
      }

      if (!remoteUrl) {
        skipped.push({ id, email: row.email || "", reason: "sin_url_remota" });
        continue;
      }

      if (dryRun) {
        processed.push({
          id,
          email: row.email || "",
          tipo: row.tipo || "",
          archivo_actual: currentFinal || "",
          archivo_remoto: remoteUrl,
          archivo_nuevo: null
        });
        continue;
      }

      try {
        const archivoFinal = await uploadRemoteUrlToCloudinary(remoteUrl, "novyra/documentos-finales");
        const currentRaw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
        const now = new Date().toISOString();

        await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            archivo_final: archivoFinal,
            raw_data: {
              ...currentRaw,
              archivoFinal,
              archivo_final: archivoFinal,
              archivo_url_temporal: remoteUrl,
              cloudinary_backfill: true,
              cloudinary_backfill_fecha: now
            }
          })
        });

        processed.push({
          id,
          email: row.email || "",
          tipo: row.tipo || "",
          archivo_actual: currentFinal || "",
          archivo_remoto: remoteUrl,
          archivo_nuevo: archivoFinal
        });
      } catch (error) {
        errors.push({
          id,
          email: row.email || "",
          tipo: row.tipo || "",
          archivo_remoto: remoteUrl,
          error: error.message,
          error_code: error.errorCode || "BACKFILL_UPLOAD_FAILED"
        });
      }
    }

    res.json({
      success: true,
      dry_run: dryRun,
      processed_count: processed.length,
      skipped_count: skipped.length,
      error_count: errors.length,
      limit,
      start_after: startAfter || null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      next_start_after: rows?.length ? rows[rows.length - 1].fecha || null : null,
      processed,
      skipped,
      errors
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/v1/n8n/final-document/resolve", async (req, res) => {
  try {
    validateAdminToken(req);

    const body = req.body || {};
    const archivoFinal = normalizeString(
      getN8nBodyField(body, [
        "archivo_final",
        "archivoFinal",
        "archivoUrl",
        "document_url",
        "documentUrl",
        "url",
        "link"
      ])
    );

    if (!archivoFinal) {
      const error = new Error("Falta la URL del documento final.");
      error.statusCode = 400;
      error.errorCode = "FINAL_DOCUMENT_URL_REQUIRED";
      throw error;
    }

    const hasSearchKey = [
      getN8nBodyField(body, ["curp", "CURP"]),
      getN8nBodyField(body, ["rfc", "RFC"]),
      getN8nBodyField(body, ["nss", "NSS"]),
      getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"]),
      getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"])
    ].some((value) => Boolean(normalizeString(value)));

    if (!hasSearchKey) {
      const error = new Error("Falta CURP, RFC, NSS o idCorto para localizar la solicitud.");
      error.statusCode = 400;
      error.errorCode = "N8N_LOOKUP_KEY_REQUIRED";
      throw error;
    }

    const rows = await supabaseRequest(
      "solicitudes?select=*&order=fecha.desc&limit=5000"
    );

    const candidatos = (rows || [])
      .filter(isMeaningfulAdminSolicitud)
      .filter((row) => {
        const estatus = normalizeForCompare(row.estatus || row.raw_data?.estatus || "");
        const archivoActual = normalizeString(row.archivo_final || row.raw_data?.archivo_final || row.raw_data?.archivoFinal);
        if (archivoActual) return false;
        if (row.finalizado === true && estatus.includes("termin")) return false;
        return solicitudCoincideConDocumentoN8n(row, body);
      });

    if (!candidatos.length) {
      const error = new Error("No se encontro una solicitud pendiente que coincida con el documento.");
      error.statusCode = 404;
      error.errorCode = "N8N_REQUEST_NOT_FOUND";
      error.details = {
        received: {
          curp: normalizeString(getN8nBodyField(body, ["curp", "CURP"])),
          rfc: normalizeString(getN8nBodyField(body, ["rfc", "RFC"])),
          nss: normalizeString(getN8nBodyField(body, ["nss", "NSS"])),
          valorDetectado: normalizeString(getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"])),
          idCorto: normalizeString(getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"]))
        },
        scanned: (rows || []).length
      };
      throw error;
    }

    if (candidatos.length > 1) {
      console.warn("n8n final-document resolve encontro multiples candidatos; se usara el mas reciente", {
        total: candidatos.length,
        ids: candidatos.slice(0, 5).map((row) => row.firebase_id || row.id)
      });
    }

    const solicitud = candidatos[0];
    const currentRaw = solicitud.raw_data && typeof solicitud.raw_data === "object" ? solicitud.raw_data : {};
    const estatus = normalizeString(body.estatus || "Terminado") || "Terminado";
    const now = new Date().toISOString();
    const id = solicitud.firebase_id || solicitud.id;

    const updated = await supabaseRequest(`solicitudes?${supabaseSolicitudFilterByPanelId(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        archivo_final: archivoFinal,
        estatus,
        finalizado: true,
        raw_data: {
          ...currentRaw,
          archivoFinal,
          archivo_final: archivoFinal,
          n8n_documento_subido: true,
          n8n_fecha_documento: now,
          n8n_origen: normalizeString(body.origen || "n8n"),
          n8n_resuelto_por: {
            curp: normalizeString(getN8nBodyField(body, ["curp", "CURP"])),
            rfc: normalizeString(getN8nBodyField(body, ["rfc", "RFC"])),
            nss: normalizeString(getN8nBodyField(body, ["nss", "NSS"])),
            valorDetectado: normalizeString(getN8nBodyField(body, ["valorDetectado", "valor_detectado", "VALOR_DETECTADO"])),
            idCorto: normalizeString(getN8nBodyField(body, ["idCorto", "id_corto", "IDCORTO"]))
          }
        }
      })
    });

    res.json({
      success: true,
      resolved_id: id,
      matched_count: candidatos.length,
      request: mapSupabaseAdminSolicitud(updated?.[0] || solicitud)
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

app.get("/api/v1/dashboard/debug-data", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const asesor = await getSupabaseAsesorByUid(auth.uid);
    const solicitudes = await supabaseRequest(
      `solicitudes?firebase_uid=eq.${supabaseEq(auth.uid)}&select=id&limit=500`
    );

    res.json({
      success: true,
      uid: auth.uid,
      email_token: auth.email || "",
      supabase_schema: SUPABASE_SCHEMA,
      supabase_configurada: Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
      asesor_encontrado: Boolean(asesor),
      asesor_email: asesor?.email || "",
      asesor_nombre: asesor?.nombre || "",
      saldo_actual: asesor ? Number(asesor.saldo_actual || 0) : null,
      solicitudes_encontradas: Array.isArray(solicitudes) ? solicitudes.length : 0
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/finance", async (req, res) => {
  try {
    const auth = await authenticateDashboardUser(req);
    const asesor = await getSupabaseAsesorByUid(auth.uid);

    if (!asesor) {
      const error = new Error("No existe el expediente del asesor.");
      error.statusCode = 404;
      error.errorCode = "ASESOR_NOT_FOUND";
      throw error;
    }

    const uid = supabaseEq(auth.uid);
    const [ledgerRows, solicitudRows, pagoRows] = await Promise.all([
      supabaseRequest(`movimientos_saldo?firebase_uid=eq.${uid}&select=*&order=fecha_movimiento.desc&limit=80`),
      supabaseRequest(`solicitudes?firebase_uid=eq.${uid}&select=*&order=fecha.desc&limit=80`),
      supabaseRequest(`notificaciones_pago?firebase_uid=eq.${uid}&select=*&order=fecha.desc&limit=80`)
    ]);

    const ledgerRefs = new Set((ledgerRows || []).map((row) => String(row.referencia_id || "")).filter(Boolean));

    const ledgerMovements = (ledgerRows || []).map((row) => ({
      id: row.id || row.referencia_id || crypto.randomUUID(),
      tipo_movimiento: row.tipo || "movimiento",
      titulo: row.descripcion || row.tipo || "Movimiento de saldo",
      detalle: row.referencia_tipo || "",
      monto: Number(row.monto || 0),
      saldo_antes: row.saldo_antes === null || row.saldo_antes === undefined ? null : Number(row.saldo_antes || 0),
      saldo_despues: row.saldo_despues === null || row.saldo_despues === undefined ? null : Number(row.saldo_despues || 0),
      estatus: row.tipo || "",
      fecha: row.fecha_movimiento || row.created_at || null,
      origen: row.origen || "Sistema"
    }));

    const solicitudMovements = (solicitudRows || []).filter((row) => {
      const ref = String(row.firebase_id || row.id || "");
      return !ref || !ledgerRefs.has(ref);
    }).map((row) => {
      const costo = Number(row.costo || 0);
      const reembolso = Number(row.monto_reembolsado || 0);
      const esReembolso = row.reembolsado === true || reembolso > 0 || String(row.estatus || "").toLowerCase().includes("error");

      return {
        id: row.firebase_id || row.id,
        tipo_movimiento: esReembolso ? "reembolso_tramite" : "cargo_tramite",
        titulo: esReembolso ? `Reembolso: ${row.tipo || "tramite"}` : row.tipo || "Tramite",
        detalle: [row.curp, row.nss ? `NSS: ${row.nss}` : ""].filter(Boolean).join(" | "),
        monto: esReembolso ? Math.abs(reembolso || costo) : -Math.abs(costo),
        saldo_antes: null,
        saldo_despues: null,
        estatus: row.estatus || "",
        fecha: row.fecha || row.created_at || null,
        origen: row.raw_data?.origen || "Dashboard"
      };
    });

    const pagoMovements = (pagoRows || []).filter((row) => {
      const ref = String(row.firebase_id || row.id || "");
      return !ref || !ledgerRefs.has(ref);
    }).map((row) => ({
      id: row.firebase_id || row.id,
      tipo_movimiento: "recarga",
      titulo: `Recarga ${row.estatus || "reportada"}`,
      detalle: row.rastreo ? `Rastreo: ${row.rastreo}` : "",
      monto: Math.abs(Number(row.monto || 0)),
      saldo_antes: null,
      saldo_despues: null,
      estatus: row.estatus || "pendiente",
      fecha: row.fecha || row.created_at || null,
      origen: "Recarga"
    }));

    const movimientos = [
      ...ledgerMovements,
      ...solicitudMovements,
      ...pagoMovements
    ]
      .filter((m) => m.fecha)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 100);

    res.json({
      success: true,
      asesor: {
        uid: auth.uid,
        email: auth.email || asesor.email || "",
        nombre: asesor.nombre || ""
      },
      saldo: Number(asesor.saldo_actual || 0),
      movimientos
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/services", async (req, res) => {
  try {
    await authenticateFirebaseUserToken(req);

    res.json({
      success: true,
      prices: DASHBOARD_SERVICE_PRICES,
      catalog: DASHBOARD_SERVICE_CATALOG,
      aforeOptions: DASHBOARD_AFORE_OPTIONS
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
    const rawSolicitud = {
      origen: "dashboard",
      created_via: "dashboard_backend",
      file_ine_f: normalizeString(body.file_ine_f || "N/A") || "N/A",
      file_ine_r: normalizeString(body.file_ine_r || "N/A") || "N/A",
      file_selfie: normalizeString(body.file_selfie || "N/A") || "N/A",
      file_comp_domicilio: normalizeString(body.file_comp_domicilio || "N/A") || "N/A",
      file_edocta: normalizeString(body.file_edocta || "N/A") || "N/A"
    };

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
          raw_data: rawSolicitud
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

    const n8nResult = await notifyN8n(buildN8nSolicitudPayload({
      firebase_id: solicitudId,
      firebase_uid: auth.uid,
      email: asesorEmail,
      tipo: serviceDisplayName,
      curp,
      nss,
      detalles_extra: detallesExtra,
      cuestionario,
      raw_data: rawSolicitud
    }));

    try {
      await supabaseRequest(`solicitudes?firebase_id=eq.${supabaseEq(solicitudId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          raw_data: {
            ...rawSolicitud,
            n8n_ok: n8nResult.ok,
            n8n_status: n8nResult.status,
            n8n_error: n8nResult.error || null,
            n8n_response: n8nResult.response || "",
            n8n_ultimo_envio: new Date().toISOString()
          }
        })
      });
    } catch (n8nAuditError) {
      console.error("n8n audit patch error", n8nAuditError);
    }

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

app.get("/api/v1/dashboard/requests/:id/file", async (req, res) => {
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
      const error = new Error("No tienes permiso para descargar esta solicitud.");
      error.statusCode = 403;
      error.errorCode = "REQUEST_FORBIDDEN";
      throw error;
    }

    const archivoFinal = resolveArchivoFinal(solicitud);
    if (!archivoFinal) {
      const error = new Error("El documento final aun no tiene enlace de descarga.");
      error.statusCode = 404;
      error.errorCode = "FINAL_DOCUMENT_NOT_READY";
      throw error;
    }

    await supabaseRequest(`solicitudes?firebase_id=eq.${supabaseEq(solicitudId)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        archivo_final: archivoFinal,
        raw_data: {
          ...(solicitud.raw_data || {}),
          archivoFinal,
          archivo_final: archivoFinal,
          descargado_cliente: true,
          fecha_descarga_cliente: new Date().toISOString()
        }
      })
    });

    res.redirect(302, archivoFinal);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/v1/dashboard/requests/:id/file-url", async (req, res) => {
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
      const error = new Error("No tienes permiso para descargar esta solicitud.");
      error.statusCode = 403;
      error.errorCode = "REQUEST_FORBIDDEN";
      throw error;
    }

    const archivoFinal = resolveArchivoFinal(solicitud);
    if (!archivoFinal) {
      const error = new Error("El documento final aun no tiene enlace de descarga.");
      error.statusCode = 404;
      error.errorCode = "FINAL_DOCUMENT_NOT_READY";
      throw error;
    }

    await supabaseRequest(`solicitudes?firebase_id=eq.${supabaseEq(solicitudId)}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        archivo_final: archivoFinal,
        raw_data: {
          ...(solicitud.raw_data || {}),
          archivoFinal,
          archivo_final: archivoFinal,
          descargado_cliente: true,
          fecha_descarga_cliente: new Date().toISOString()
        }
      })
    });

    res.json({
      success: true,
      url: archivoFinal
    });
  } catch (error) {
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
