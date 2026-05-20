# DPR Pension Segura - Guia de Integracion API B2B

Documento para clientes e integradores externos.

## 1. Introduccion

La API B2B de DPR Pension Segura permite a clientes autorizados consultar saldo, consultar servicios disponibles, crear solicitudes de tramite y consultar el estado o resultado de una solicitud.

Esta API funciona mediante autenticacion por API Key.

## 2. URL base

URL base de produccion:

https://us-central1-pensionsegura-9c817.cloudfunctions.net/api

Los endpoints internos usan la version /api/v1.

Ejemplo:

https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/balance

## 3. Autenticacion

Todas las rutas protegidas requieren API Key.

Header recomendado:

x-api-key: TU_API_KEY

Tambien se permite:

Authorization: Bearer TU_API_KEY

La API Key debe usarse solamente desde backend, servidor privado o herramientas internas seguras. No debe exponerse en frontend publico ni subirse a repositorios.

## 4. Endpoints principales

GET /health
Valida que la API este activa.

GET /api/v1/balance
Consulta el saldo disponible.

GET /api/v1/services
Consulta la lista de servicios disponibles.

POST /api/v1/requests
Crea una solicitud sin archivos usando JSON.

POST /api/v1/requests-with-files
Crea una solicitud con archivos usando multipart/form-data.

GET /api/v1/requests/{id}
Consulta el estado de una solicitud.

GET /api/v1/requests/{id}/result
Consulta el resultado final cuando ya este disponible.

## Servicios disponibles

### IMSS / TRÁMITES

| service_code | Servicio | Precio |
|---|---|---:|
| SEMANAS_COTIZADAS | Semanas cotizadas | 18 |
| SEMANAS_DETALLADAS | Semanas detalladas | 35 |
| SINDO_ULTIMO_RETIRO | SINDO último retiro | 45 |
| SINDO_ALFANUMERICO | SINDO alfanumérico | 55 |
| SINDO_SALARIO_PROMEDIO | SINDO salario promedio | 95 |
| SINDO_VIGENCIA | SINDO vigencia | 95 |
| SINDO_COMPLETO | SINDO completo | 190 |
| TARJETA_NSS | Tarjeta NSS | 20 |
| INSCRIPCION_MODALIDAD_10 | Inscripción Modalidad 10 | 200 |
| ALTA_MENSUAL | Alta mensual | 600 |
| ALTA_DESEMPLEO_LINEA_CAPTURA | Alta desempleo con línea de captura | 200 |
| ALTA_DESEMPLEO_APORTACIONES | Alta desempleo con aportaciones | 650 |

### SAT / RFC

| service_code | Servicio | Precio |
|---|---|---:|
| RFC_CLON | RFC Clon | 25 |
| RFC_VERIFICABLE | RFC Verificable | 110 |
| RFC_IDCIF | RFC con IDCIF | 20 |
| RFC_ORIGINAL | RFC Original | 180 |
| LOCALIZACION_IDCIF | Localización de IDCIF | 60 |

### DOCUMENTOS OFICIALES

| service_code | Servicio | Precio |
|---|---|---:|
| BURO_CREDITO | Buró de Crédito | 170 |
| CURP | CURP Certificada | 4 |
| ACTA_NACIMIENTO | Acta de nacimiento | 11 |
| ACTA_MATRIMONIO | Acta de matrimonio | 11 |
| ACTA_DIVORCIO | Acta de divorcio | 11 |
| ACTA_DEFUNCION | Acta de defunción | 11 |
| VIGENCIA_DERECHOS | Vigencia de derechos | 24 |

### INFONAVIT

| service_code | Servicio | Precio |
|---|---|---:|
| LOCALIZACION_CONTRASENA_INFONAVIT | Localización de contraseña | 150 |
| RESETEO_INFONAVIT | Reseteo de cuenta | 150 |
| PRECALIFICACION_MEJORAVIT | Precalificación Mejoravit | 100 |
| PRECALIFICACION_LINEA_II | Precalificación Línea II | 100 |
| CREAR_CUENTA_INFONAVIT | Crear cuenta Infonavit | 150 |
| HISTORICO_INFONAVIT | Histórico Infonavit | 150 |

### AFORE

| service_code | Servicio | Precio |
|---|---|---:|
| REGISTRO_AFORE_DISTANCIA | Registro a distancia | 90 |
| RETIRO_DESEMPLEO_AFORE | Retiro por desempleo | 60 |
| CAMBIO_CONTRASENA_AFORE | Cambio de contraseña AFORE | 30 |
| ESTADO_CUENTA_AFORE_AZTECA | Estado de cuenta Afore Azteca | 500 |
| ESTADO_CUENTA_AFORE_COPPEL | Estado de cuenta Afore Coppel | 500 |
| ESTADO_CUENTA_AFORE_PROFUTURO | Estado de cuenta Afore Profuturo | 500 |
| ESTADO_CUENTA_AFORE_INVERCAP | Estado de cuenta Afore Invercap | 1400 |
| ESTADO_CUENTA_AFORE_SURA | Estado de cuenta Afore SURA | 800 |
| ESTADO_CUENTA_AFORE_BANORTE | Estado de cuenta Afore Banorte | 500 |
| ESTADO_CUENTA_AFORE_PRINCIPAL | Estado de cuenta Afore Principal | 500 |
| ESTADO_CUENTA_AFORE_BANAMEX | Estado de cuenta Afore Banamex | 1200 |

### PENSIONES

| service_code | Servicio | Precio |
|---|---|---:|
| ANALISIS_RAPIDO_PENSION | Análisis rápido | 200 |
| ANALISIS_DETALLADO_PENSION | Análisis detallado | 3000 |

## 6. Health Check

Comando:

curl https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/health

Respuesta esperada:

{
  "success": true,
  "service": "DPR API",
  "status": "ok"
}

## 7. Consultar saldo

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/balance" \
  -H "x-api-key: TU_API_KEY"

Respuesta ejemplo:

{
  "success": true,
  "asesor_uid": "ASESOR_UID",
  "asesor_email": "",
  "nombre": "Nombre del asesor",
  "saldo": 1000
}

## 8. Consultar servicios

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/services" \
  -H "x-api-key: TU_API_KEY"

Respuesta ejemplo:

{
  "success": true,
  "services": [
    {
      "service_code": "CURP",
      "service_name": "CURP",
      "inventario_id": "ID",
      "precio_venta": 15,
      "costo_propio": 0
    }
  ]
}

## 9. Crear solicitud sin archivos

Endpoint:

POST /api/v1/requests

Headers:

Content-Type: application/json
x-api-key: TU_API_KEY

Body ejemplo:

{
  "service_code": "CURP",
  "external_reference": "CLIENTE-001",
  "curp": "XXXX000000XXXXXX00",
  "nss": "N/A",
  "details": {
    "nombre_cliente": "Cliente Prueba",
    "telefono": "8440000000",
    "correo": "cliente@correo.com",
    "nota": "Solicitud creada desde API B2B"
  },
  "cuestionario": {
    "origen": "integracion_b2b"
  }
}

Comando:

curl -X POST "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests" \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "service_code": "CURP",
    "external_reference": "CLIENTE-001",
    "curp": "XXXX000000XXXXXX00",
    "nss": "N/A",
    "details": {
      "nombre_cliente": "Cliente Prueba",
      "telefono": "8440000000",
      "correo": "cliente@correo.com",
      "nota": "Solicitud creada desde API B2B"
    },
    "cuestionario": {
      "origen": "integracion_b2b"
    }
  }'

## 10. Crear solicitud con archivos

Endpoint:

POST /api/v1/requests-with-files

Tipo de contenido:

multipart/form-data

Campos aceptados:

service_code
external_reference
curp
nss
details
cuestionario
file_ine_f
file_ine_r
file_selfie
file_comp_domicilio
file_edocta

Comando:

curl -X POST "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests-with-files" \
  -H "x-api-key: TU_API_KEY" \
  -F "service_code=CURP" \
  -F "external_reference=CLIENTE-ARCHIVO-001" \
  -F "curp=XXXX000000XXXXXX00" \
  -F "nss=N/A" \
  -F 'details={"nombre_cliente":"Cliente Prueba","telefono":"8440000000","correo":"cliente@correo.com","nota":"Solicitud con archivo"}' \
  -F 'cuestionario={"origen":"curl","tipo_prueba":"multipart"}' \
  -F "file_ine_f=@/ruta/al/archivo.pdf"

Respuesta ejemplo:

{
  "success": true,
  "solicitud_id": "SOLICITUD_ID",
  "external_reference": "CLIENTE-ARCHIVO-001",
  "service_code": "CURP",
  "service_name": "CURP",
  "estatus": "En Proceso",
  "costo": 15,
  "balance_before": 1000,
  "balance_after": 985,
  "files": {
    "file_ine_f": "https://...",
    "file_ine_r": "N/A",
    "file_selfie": "N/A",
    "file_comp_domicilio": "N/A",
    "file_edocta": "N/A"
  }
}

## 11. Consultar estado de solicitud

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests/SOLICITUD_ID" \
  -H "x-api-key: TU_API_KEY"

Respuesta ejemplo:

{
  "success": true,
  "solicitud_id": "SOLICITUD_ID",
  "external_reference": "CLIENTE-001",
  "service_code": "CURP",
  "service_name": "CURP",
  "estatus": "En Proceso",
  "finalizado": false,
  "archivoFinal": null,
  "error": null,
  "created_via": "api",
  "origen": "API"
}

## 12. Consultar resultado final

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests/SOLICITUD_ID/result" \
  -H "x-api-key: TU_API_KEY"

Si el resultado aun no esta listo:

{
  "success": false,
  "error_code": "RESULT_NOT_READY",
  "message": "El resultado todavía no está disponible."
}

Si el resultado ya esta listo:

{
  "success": true,
  "solicitud_id": "SOLICITUD_ID",
  "external_reference": "CLIENTE-001",
  "estatus": "Finalizado",
  "finalizado": true,
  "archivoFinal": "https://..."
}

## 13. Errores comunes

400 SERVICE_CODE_REQUIRED - Falta service_code.
400 UNSUPPORTED_SERVICE_CODE - Servicio no soportado.
400 INVALID_CONTENT_TYPE - Se esperaba multipart/form-data.
401 API_KEY_REQUIRED - Falta API Key.
401 INVALID_API_KEY - API Key invalida.
401 INACTIVE_API_KEY - API Key inactiva.
402 INSUFFICIENT_BALANCE - Saldo insuficiente.
403 PERMISSION_DENIED - API Key sin permiso.
403 REQUEST_FORBIDDEN - Solicitud no pertenece al asesor.
404 REQUEST_NOT_FOUND - Solicitud no encontrada.
404 RESULT_NOT_READY - Resultado aun no disponible.
413 FILE_TOO_LARGE - Archivo demasiado grande.
500 INTERNAL_ERROR - Error interno.

## 14. Recomendaciones de seguridad

- No usar la API Key en frontend publico.
- No subir la API Key a GitHub.
- No compartir la API Key en chats publicos.
- Guardar solicitud_id y external_reference.
- Consultar el resultado usando /api/v1/requests/{id}/result.
- Evitar solicitudes duplicadas.
- Proteger documentos personales y archivos oficiales.
- Solicitar rotacion de API Key si se sospecha exposicion.

## 15. Flujo recomendado de integracion

1. Probar GET /health.
2. Probar GET /api/v1/balance.
3. Probar GET /api/v1/services.
4. Crear solicitud de prueba con POST /api/v1/requests.
5. Guardar solicitud_id.
6. Consultar estado con GET /api/v1/requests/{id}.
7. Si aplica, probar POST /api/v1/requests-with-files.
8. Consultar resultado final con GET /api/v1/requests/{id}/result.

## 16. Entregables incluidos

- Guia de integracion API B2B.
- Coleccion Postman.
- Environment Postman.
- API Key entregada por canal seguro.
