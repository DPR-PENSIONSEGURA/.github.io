const admin = require("./../functions/node_modules/firebase-admin");

const PROJECT_ID = "pensionsegura-9c817";
const DRY_RUN = process.env.DRY_RUN !== "false";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID
  });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const catalogo = [
  { service_code: "SEMANAS_COTIZADAS", nombre: "SEMANAS", precioVenta: 18, categoria: "IMSS / TRAMITES" },
  { service_code: "SEMANAS_DETALLADAS", nombre: "SEMANAS DETALLADAS", precioVenta: 35, categoria: "IMSS / TRAMITES" },
  { service_code: "SINDO_ULTIMO_RETIRO", nombre: "SINDO ULT RET", precioVenta: 45, categoria: "IMSS / TRAMITES" },
  { service_code: "SINDO_ALFANUMERICO", nombre: "SINDO ALFANUMERICO", precioVenta: 55, categoria: "IMSS / TRAMITES" },
  { service_code: "SINDO_SALARIO_PROMEDIO", nombre: "SINDO SALARIO PROMEDIO", precioVenta: 95, categoria: "IMSS / TRAMITES" },
  { service_code: "SINDO_VIGENCIA", nombre: "SINDO VIGENCIA", precioVenta: 95, categoria: "IMSS / TRAMITES" },
  { service_code: "SINDO_COMPLETO", nombre: "SINDO COMPLETO", precioVenta: 190, categoria: "IMSS / TRAMITES" },
  { service_code: "TARJETA_NSS", nombre: "TARJETA NSS", precioVenta: 20, categoria: "IMSS / TRAMITES" },
  { service_code: "INSCRIPCION_MODALIDAD_10", nombre: "INSCRIPCION MODALIDAD 10", precioVenta: 200, categoria: "IMSS / TRAMITES" },
  { service_code: "ALTA_MENSUAL", nombre: "ALTA MENSUAL", precioVenta: 600, categoria: "IMSS / TRAMITES" },
  { service_code: "ALTA_DESEMPLEO_LINEA_CAPTURA", nombre: "ALTA DESEMPLEO LINEA CAPTURA", precioVenta: 200, categoria: "IMSS / TRAMITES" },
  { service_code: "ALTA_DESEMPLEO_APORTACIONES", nombre: "ALTA DESEMPLEO APORTACIONES", precioVenta: 650, categoria: "IMSS / TRAMITES" },

  { service_code: "RFC_CLON", nombre: "CLON RFC", precioVenta: 25, categoria: "SAT / RFC" },
  { service_code: "RFC_VERIFICABLE", nombre: "RFC VER", precioVenta: 110, categoria: "SAT / RFC" },
  { service_code: "RFC_IDCIF", nombre: "RFC IDCIF", precioVenta: 20, categoria: "SAT / RFC" },
  { service_code: "RFC_ORIGINAL", nombre: "RFC ORIGINAL", precioVenta: 180, categoria: "SAT / RFC" },
  { service_code: "LOCALIZACION_IDCIF", nombre: "LOCALIZACION IDCIF", precioVenta: 60, categoria: "SAT / RFC" },

  { service_code: "BURO_CREDITO", nombre: "DPR BURÓ DE CREDITO", precioVenta: 170, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "CURP", nombre: "CURP", precioVenta: 4, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_NACIMIENTO", nombre: "ACTA", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_MATRIMONIO", nombre: "ACTA MATRIMONIO", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_DIVORCIO", nombre: "ACTA DIVORCIO", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_DEFUNCION", nombre: "ACTA DEFUNCION", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "VIGENCIA_DERECHOS", nombre: "VIGENCIA DERECHOS", precioVenta: 24, categoria: "DOCUMENTOS OFICIALES" },

  { service_code: "LOCALIZACION_CONTRASENA_INFONAVIT", nombre: "LOCALIZACION CONTRASENA INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "RESETEO_INFONAVIT", nombre: "RESETEO INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "PRECALIFICACION_MEJORAVIT", nombre: "PRECALIFICACION MEJORAVIT", precioVenta: 100, categoria: "INFONAVIT" },
  { service_code: "PRECALIFICACION_LINEA_II", nombre: "PRECALIFICACION LINEA II", precioVenta: 100, categoria: "INFONAVIT" },
  { service_code: "CREAR_CUENTA_INFONAVIT", nombre: "CREAR CUENTA INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "HISTORICO_INFONAVIT", nombre: "HISTORICO INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },

  { service_code: "REGISTRO_AFORE_DISTANCIA", nombre: "REGISTRO AFORE DISTANCIA", precioVenta: 90, categoria: "AFORE" },
  { service_code: "RETIRO_DESEMPLEO_AFORE", nombre: "RETIRO DESEMPLEO AFORE", precioVenta: 60, categoria: "AFORE" },
  { service_code: "CAMBIO_CONTRASENA_AFORE", nombre: "CAMBIO CONTRASENA AFORE", precioVenta: 30, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_AZTECA", nombre: "ESTADO CUENTA AFORE AZTECA", precioVenta: 500, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_COPPEL", nombre: "ESTADO CUENTA AFORE COPPEL", precioVenta: 500, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_PROFUTURO", nombre: "ESTADO CUENTA AFORE PROFUTURO", precioVenta: 500, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_INVERCAP", nombre: "ESTADO CUENTA AFORE INVERCAP", precioVenta: 1400, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_SURA", nombre: "ESTADO CUENTA AFORE SURA", precioVenta: 800, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_BANORTE", nombre: "ESTADO CUENTA AFORE BANORTE", precioVenta: 500, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_PRINCIPAL", nombre: "ESTADO CUENTA AFORE PRINCIPAL", precioVenta: 500, categoria: "AFORE" },
  { service_code: "ESTADO_CUENTA_AFORE_BANAMEX", nombre: "ESTADO CUENTA AFORE BANAMEX", precioVenta: 1200, categoria: "AFORE" },

  { service_code: "ANALISIS_RAPIDO_PENSION", nombre: "ANALISIS RAPIDO PENSION", precioVenta: 200, categoria: "PENSIONES" },
  { service_code: "ANALISIS_DETALLADO_PENSION", nombre: "ANALISIS DETALLADO PENSION", precioVenta: 3000, categoria: "PENSIONES" }
];

async function main() {
  console.log(`Proyecto: ${PROJECT_ID}`);
  console.log(`Modo: ${DRY_RUN ? "DRY_RUN - no modifica Firestore" : "APLICAR CAMBIOS REALES"}`);

  const snap = await db.collection("inventario_dpr").get();

  const actuales = snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data()
  }));

  const actualesPorNombre = new Map();

  for (const item of actuales) {
    const normalized = normalizeName(item.nombre);

    if (!actualesPorNombre.has(normalized)) {
      actualesPorNombre.set(normalized, []);
    }

    actualesPorNombre.get(normalized).push(item);
  }

  const updates = [];
  const creates = [];
  const skips = [];

  for (const item of catalogo) {
    const normalized = normalizeName(item.nombre);
    const matches = actualesPorNombre.get(normalized) || [];

    if (matches.length > 1) {
      skips.push({
        reason: "DUPLICADO_NOMBRE",
        item,
        matches: matches.map((match) => ({
          id: match.id,
          nombre: match.nombre,
          precioVenta: match.precioVenta
        }))
      });
      continue;
    }

    if (matches.length === 1) {
      const actual = matches[0];

      const patch = {
        service_code: item.service_code,
        categoria: item.categoria,
        precioVenta: item.precioVenta,
        updated_at: FieldValue.serverTimestamp()
      };

      updates.push({
        id: actual.id,
        nombre: actual.nombre,
        precio_actual: Number(actual.precioVenta || 0),
        precio_nuevo: item.precioVenta,
        patch,
        ref: actual.ref
      });

      continue;
    }

    creates.push({
      service_code: item.service_code,
      nombre: item.nombre,
      precioVenta: item.precioVenta,
      costoPropio: 0,
      categoria: item.categoria,
      activo: true,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });
  }

  console.log("");
  console.log("=== RESUMEN PLAN ===");
  console.log(`Actualizar existentes: ${updates.length}`);
  console.log(`Crear nuevos: ${creates.length}`);
  console.log(`Omitidos: ${skips.length}`);

  console.log("");
  console.log("=== ACTUALIZACIONES ===");
  console.table(
    updates.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      precio_actual: item.precio_actual,
      precio_nuevo: item.precio_nuevo
    }))
  );

  console.log("");
  console.log("=== CREACIONES ===");
  console.table(
    creates.map((item) => ({
      service_code: item.service_code,
      nombre: item.nombre,
      precioVenta: item.precioVenta,
      categoria: item.categoria
    }))
  );

  if (skips.length > 0) {
    console.log("");
    console.log("=== OMITIDOS ===");
    console.dir(skips, { depth: 8 });
  }

  if (DRY_RUN) {
    console.log("");
    console.log("DRY_RUN activo. No se modifico Firestore.");
    console.log("Para aplicar: DRY_RUN=false node scripts/update-inventario-dpr.js");
    return;
  }

  const batch = db.batch();

  for (const item of updates) {
    batch.update(item.ref, item.patch);
  }

  for (const item of creates) {
    const ref = db.collection("inventario_dpr").doc();
    batch.set(ref, item);
  }

  await batch.commit();

  console.log("");
  console.log("CAMBIOS APLICADOS CORRECTAMENTE EN FIRESTORE.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR_UPDATE_INVENTARIO:", error);
    process.exit(1);
  });
