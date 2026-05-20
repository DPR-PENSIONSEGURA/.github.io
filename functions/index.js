const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
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
  RFC_VERIFICABLE: "RFC VER",
  RFC_ORIGINAL: "RFC ORIGINAL",
  RFC_IDCIF: "RFC IDCIF",
  RFC_CLON: "CLON RFC",
  TARJETA_NSS: "TARJETA NSS",
  VIGENCIA: "VIGENCIA",
  CURP: "CURP",
  ACTA_NACIMIENTO: "ACTA",
  BURO_CREDITO: "DPR BURÓ DE CREDITO",
  RESETEO_INFONAVIT: "RESETEO INFONAVIT",
  ALTA_DESEMPLEO: "ALTA DESEMPLEO",
  SINDO_ULTIMO_RETIRO: "SINDO ULT RET",
  RETIRO: "RETIRO",
  RETIRO_50: "RETIRO 50",
  CONTRASENA: "CONTRASEÑA",
  REGISTRO: "REGISTRO",
  ANTECEDENTES: "ANTECEDENTES"
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

function getMultipartJsonField(req, name, fallback) {
  const raw = req.body?.[name];

  if (raw === undefined || raw === null || raw === "") return fallback;

  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
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
