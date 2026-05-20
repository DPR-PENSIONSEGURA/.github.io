const admin = require("./../functions/node_modules/firebase-admin");

const PROJECT_ID = "pensionsegura-9c817";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: PROJECT_ID
  });
}

const db = admin.firestore();

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const nuevoCatalogo = [
  // IMSS / TRAMITES
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

  // SAT / RFC
  { service_code: "RFC_CLON", nombre: "CLON RFC", precioVenta: 25, categoria: "SAT / RFC" },
  { service_code: "RFC_VERIFICABLE", nombre: "RFC VER", precioVenta: 110, categoria: "SAT / RFC" },
  { service_code: "RFC_IDCIF", nombre: "RFC IDCIF", precioVenta: 20, categoria: "SAT / RFC" },
  { service_code: "RFC_ORIGINAL", nombre: "RFC ORIGINAL", precioVenta: 180, categoria: "SAT / RFC" },
  { service_code: "LOCALIZACION_IDCIF", nombre: "LOCALIZACION IDCIF", precioVenta: 60, categoria: "SAT / RFC" },

  // DOCUMENTOS OFICIALES
  { service_code: "BURO_CREDITO", nombre: "DPR BURÓ DE CREDITO", precioVenta: 170, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "CURP", nombre: "CURP", precioVenta: 4, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_NACIMIENTO", nombre: "ACTA", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_MATRIMONIO", nombre: "ACTA MATRIMONIO", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_DIVORCIO", nombre: "ACTA DIVORCIO", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "ACTA_DEFUNCION", nombre: "ACTA DEFUNCION", precioVenta: 11, categoria: "DOCUMENTOS OFICIALES" },
  { service_code: "VIGENCIA_DERECHOS", nombre: "VIGENCIA DERECHOS", precioVenta: 24, categoria: "DOCUMENTOS OFICIALES" },

  // INFONAVIT
  { service_code: "LOCALIZACION_CONTRASENA_INFONAVIT", nombre: "LOCALIZACION CONTRASENA INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "RESETEO_INFONAVIT", nombre: "RESETEO INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "PRECALIFICACION_MEJORAVIT", nombre: "PRECALIFICACION MEJORAVIT", precioVenta: 100, categoria: "INFONAVIT" },
  { service_code: "PRECALIFICACION_LINEA_II", nombre: "PRECALIFICACION LINEA II", precioVenta: 100, categoria: "INFONAVIT" },
  { service_code: "CREAR_CUENTA_INFONAVIT", nombre: "CREAR CUENTA INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },
  { service_code: "HISTORICO_INFONAVIT", nombre: "HISTORICO INFONAVIT", precioVenta: 150, categoria: "INFONAVIT" },

  // AFORE
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

  // PENSIONES
  { service_code: "ANALISIS_RAPIDO_PENSION", nombre: "ANALISIS RAPIDO PENSION", precioVenta: 200, categoria: "PENSIONES" },
  { service_code: "ANALISIS_DETALLADO_PENSION", nombre: "ANALISIS DETALLADO PENSION", precioVenta: 3000, categoria: "PENSIONES" }
];

async function main() {
  const snap = await db.collection("inventario_dpr").get();

  const actuales = snap.docs.map((doc) => ({
    id: doc.id,
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

  const nuevosPorNombre = new Map(
    nuevoCatalogo.map((item) => [normalizeName(item.nombre), item])
  );

  const existentes = [];
  const faltantes = [];
  const duplicados = [];
  const fueraCatalogo = [];

  for (const item of nuevoCatalogo) {
    const normalized = normalizeName(item.nombre);
    const matches = actualesPorNombre.get(normalized) || [];

    if (matches.length === 0) {
      faltantes.push(item);
      continue;
    }

    if (matches.length > 1) {
      duplicados.push({
        catalogo: item,
        matches
      });
    }

    const actual = matches[0];

    existentes.push({
      id: actual.id,
      service_code: item.service_code,
      nombre_catalogo: item.nombre,
      nombre_actual: actual.nombre,
      categoria: item.categoria,
      precio_actual: Number(actual.precioVenta || 0),
      precio_nuevo: item.precioVenta,
      cambia_precio: Number(actual.precioVenta || 0) !== item.precioVenta,
      costoPropio_actual: actual.costoPropio ?? null,
      estatus_actual: actual.estatus ?? actual.status ?? null
    });
  }

  for (const actual of actuales) {
    const normalized = normalizeName(actual.nombre);
    if (!nuevosPorNombre.has(normalized)) {
      fueraCatalogo.push({
        id: actual.id,
        nombre: actual.nombre,
        precioVenta: actual.precioVenta ?? null,
        costoPropio: actual.costoPropio ?? null,
        estatus: actual.estatus ?? actual.status ?? null
      });
    }
  }

  console.log("");
  console.log("=== RESUMEN ===");
  console.log(`Inventario actual Firestore: ${actuales.length}`);
  console.log(`Nuevo catalogo: ${nuevoCatalogo.length}`);
  console.log(`Existentes encontrados: ${existentes.length}`);
  console.log(`Faltantes por crear: ${faltantes.length}`);
  console.log(`Duplicados por nombre: ${duplicados.length}`);
  console.log(`Actuales fuera del nuevo catalogo: ${fueraCatalogo.length}`);

  console.log("");
  console.log("=== EXISTENTES / CAMBIO DE PRECIO ===");
  console.table(
    existentes.map((item) => ({
      service_code: item.service_code,
      nombre_actual: item.nombre_actual,
      precio_actual: item.precio_actual,
      precio_nuevo: item.precio_nuevo,
      cambia_precio: item.cambia_precio
    }))
  );

  console.log("");
  console.log("=== FALTANTES POR CREAR ===");
  console.table(
    faltantes.map((item) => ({
      service_code: item.service_code,
      nombre: item.nombre,
      precioVenta: item.precioVenta,
      categoria: item.categoria
    }))
  );

  console.log("");
  console.log("=== DUPLICADOS POR NOMBRE ===");
  if (duplicados.length === 0) {
    console.log("Sin duplicados detectados.");
  } else {
    console.dir(duplicados, { depth: 6 });
  }

  console.log("");
  console.log("=== ACTUALES FUERA DEL NUEVO CATALOGO ===");
  console.table(fueraCatalogo);

  console.log("");
  console.log("=== JSON PARA SIGUIENTE PASO ===");
  console.log(JSON.stringify({ existentes, faltantes, duplicados, fueraCatalogo }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("ERROR_COMPARE_INVENTARIO:", error);
    process.exit(1);
  });
