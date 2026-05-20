const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const Busboy = require("busboy");
const crypto = require("crypto");
const cloudinary = require("cloudinary").v2;

setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

const N8N_WEBHOOK_URL = "https://n8n.srv1567730.hstgr.cloud/webhook/Nueva_acta";

const SERVICE_MAP = {
  SEMANAS_COTIZADAS: "SEMANAS",
  SEMANAS_DETALLADAS: "SEMANAS DETALLADAS",

  SINDO_ULTIMO_RETIRO: "SINDO ULT RET",
  SINDO_ALFANUMERICO: "SINDO ALFANUMERICO",
  SINDO_SALARIO_PROMEDIO: "SINDO SALARIO PROMEDIO",
  SINDO_VIGENCIA: "SINDO VIGENCIA",
  SINDO_COMPLETO: "SINDO COMPLETO",

  TARJETA_NSS: "TARJETA NSS",
  INSCRIPCION_MODALIDAD_10: "INSCRIPCION MODALIDAD 10",
  ALTA_MENSUAL: "ALTA MENSUAL",
  ALTA_DESEMPLEO_LINEA_CAPTURA: "ALTA DESEMPLEO LINEA CAPTURA",
  ALTA_DESEMPLEO_APORTACIONES: "ALTA DESEMPLEO APORTACIONES",

  RFC_CLON: "CLON RFC",
  RFC_VERIFICABLE: "RFC VER",
  RFC_IDCIF: "RFC IDCIF",
  RFC_ORIGINAL: "RFC ORIGINAL",
  LOCALIZACION_IDCIF: "LOCALIZACION IDCIF",

  BURO_CREDITO: "DPR BURÓ DE CREDITO",
  CURP: "CURP",
  ACTA_NACIMIENTO: "ACTA",
  ACTA_MATRIMONIO: "ACTA MATRIMONIO",
  ACTA_DIVORCIO: "ACTA DIVORCIO",
  ACTA_DEFUNCION: "ACTA DEFUNCION",
  VIGENCIA_DERECHOS: "VIGENCIA DERECHOS",

  LOCALIZACION_CONTRASENA_INFONAVIT: "LOCALIZACION CONTRASENA INFONAVIT",
  RESETEO_INFONAVIT: "RESETEO INFONAVIT",
  PRECALIFICACION_MEJORAVIT: "PRECALIFICACION MEJORAVIT",
  PRECALIFICACION_LINEA_II: "PRECALIFICACION LINEA II",
  CREAR_CUENTA_INFONAVIT: "CREAR CUENTA INFONAVIT",
  HISTORICO_INFONAVIT: "HISTORICO INFONAVIT",

  REGISTRO_AFORE_DISTANCIA: "REGISTRO AFORE DISTANCIA",
  RETIRO_DESEMPLEO_AFORE: "RETIRO DESEMPLEO AFORE",
  CAMBIO_CONTRASENA_AFORE: "CAMBIO CONTRASENA AFORE",
  ESTADO_CUENTA_AFORE_AZTECA: "ESTADO CUENTA AFORE AZTECA",
  ESTADO_CUENTA_AFORE_COPPEL: "ESTADO CUENTA AFORE COPPEL",
  ESTADO_CUENTA_AFORE_PROFUTURO: "ESTADO CUENTA AFORE PROFUTURO",
  ESTADO_CUENTA_AFORE_INVERCAP: "ESTADO CUENTA AFORE INVERCAP",
  ESTADO_CUENTA_AFORE_SURA: "ESTADO CUENTA AFORE SURA",
  ESTADO_CUENTA_AFORE_BANORTE: "ESTADO CUENTA AFORE BANORTE",
  ESTADO_CUENTA_AFORE_PRINCIPAL: "ESTADO CUENTA AFORE PRINCIPAL",
  ESTADO_CUENTA_AFORE_BANAMEX: "ESTADO CUENTA AFORE BANAMEX",

  ANALISIS_RAPIDO_PENSION: "ANALISIS RAPIDO PENSION",
  ANALISIS_DETALLADO_PENSION: "ANALISIS DETALLADO PENSION",

  // Alias legacy temporales para no romper integraciones anteriores.
  VIGENCIA: "VIGENCIA DERECHOS",
  ALTA_DESEMPLEO: "ALTA DESEMPLEO APORTACIONES",
  RETIRO: "RETIRO DESEMPLEO AFORE",
  CONTRASENA: "CAMBIO CONTRASENA AFORE",
  REGISTRO: "REGISTRO AFORE DISTANCIA"
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

async function findInventoryByServiceCode(serviceCode) {
  const normalizedCode = normalizeString(serviceCode).toUpperCase();
  const inventoryName = SERVICE_MAP[normalizedCode];

  if (!inventoryName) {
    const error = new Error("service_code no soportado.");
    error.statusCode = 400;
    error.errorCode = "UNSUPPORTED_SERVICE_CODE";
    throw error;
  }

  const snap = await db
    .collection("inventario_dpr")
    .where("nombre", "==", inventoryName)
    .limit(1)
    .get();

  if (snap.empty) {
    const error = new Error(`No existe inventario_dpr para ${inventoryName}.`);
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
    serviceName: data.nombre,
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

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "DPR API",
    status: "ok"
  });
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
      const snap = await db
        .collection("inventario_dpr")
        .where("nombre", "==", inventoryName)
        .limit(1)
        .get();

      if (!snap.empty) {
        const doc = snap.docs[0];
        const item = doc.data();

        services.push({
          service_code: serviceCode,
          service_name: item.nombre,
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
      "CLOUDINARY_API_SECRET"
    ],
    timeoutSeconds: 120,
    memory: "512MiB"
  },
  app
);
