# API B2B DPR Pension Segura

Documentacion tecnica para integradores B2B de DPR Pension Segura.

## 1. URL base

URL base recomendada:

https://us-central1-pensionsegura-9c817.cloudfunctions.net/api

Los endpoints internos usan /api/v1, por eso las rutas completas quedan asi:

https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/...

## 2. Autenticacion

Todas las rutas protegidas requieren API Key.

Header recomendado:

x-api-key: TU_API_KEY

Tambien se permite:

Authorization: Bearer TU_API_KEY

No compartir API Keys en chats, repositorios ni documentos publicos.

## 3. Endpoints disponibles

GET /health
Valida que la API esta activa.

GET /api/v1/balance
Consulta saldo del asesor vinculado a la API Key.

GET /api/v1/services
Lista servicios disponibles.

POST /api/v1/requests
Crea solicitud sin archivos usando JSON.

POST /api/v1/requests-with-files
Crea solicitud con archivos usando multipart/form-data.

GET /api/v1/requests/{id}
Consulta estado de una solicitud.

GET /api/v1/requests/{id}/result
Consulta resultado final de una solicitud.

## 4. Servicios disponibles

SEMANAS_COTIZADAS - SEMANAS - 35
RFC_VERIFICABLE - RFC VER - 160
RFC_ORIGINAL - RFC ORIGINAL - 230
RFC_IDCIF - RFC IDCIF - 90
RFC_CLON - CLON RFC - 60
TARJETA_NSS - TARJETA NSS - 15
VIGENCIA - VIGENCIA - 15
CURP - CURP - 15
ACTA_NACIMIENTO - ACTA - 27
BURO_CREDITO - DPR BURO DE CREDITO - 200
RESETEO_INFONAVIT - RESETEO INFONAVIT - 210
ALTA_DESEMPLEO - ALTA DESEMPLEO - 600
SINDO_ULTIMO_RETIRO - SINDO ULT RET - 40
RETIRO - RETIRO - 80
RETIRO_50 - RETIRO 50 - 50
CONTRASENA - CONTRASENA - 30
REGISTRO - REGISTRO - 100
ANTECEDENTES - ANTECEDENTES - 50

## 5. Health Check

Comando:

curl https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/health

Respuesta esperada:

{
  "success": true,
  "service": "DPR API",
  "status": "ok"
}

## 6. Consultar saldo

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/balance" \
  -H "x-api-key: TU_API_KEY"

## 7. Consultar servicios

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/services" \
  -H "x-api-key: TU_API_KEY"

## 8. Crear solicitud sin archivos

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
    "nombre_cliente": "Cliente Prueba API",
    "telefono": "8440000000",
    "correo": "cliente@correo.com",
    "nota": "Solicitud creada desde API B2B"
  },
  "cuestionario": {
    "origen": "integracion_b2b"
  }
}

Comando curl:

curl -X POST "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests" \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "service_code": "CURP",
    "external_reference": "CLIENTE-001",
    "curp": "XXXX000000XXXXXX00",
    "nss": "N/A",
    "details": {
      "nombre_cliente": "Cliente Prueba API",
      "telefono": "8440000000",
      "correo": "cliente@correo.com",
      "nota": "Solicitud creada desde API B2B"
    },
    "cuestionario": {
      "origen": "integracion_b2b"
    }
  }'

## 9. Crear solicitud con archivos

Endpoint:

POST /api/v1/requests-with-files

Content-Type:

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

Comando curl:

curl -X POST "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests-with-files" \
  -H "x-api-key: TU_API_KEY" \
  -F "service_code=CURP" \
  -F "external_reference=PRUEBA-ARCHIVO-001" \
  -F "curp=XXXX000000XXXXXX00" \
  -F "nss=N/A" \
  -F 'details={"nombre_cliente":"Cliente Prueba API","telefono":"8440000000","correo":"prueba@correo.com","nota":"Prueba multipart con Busboy"}' \
  -F 'cuestionario={"origen":"curl","tipo_prueba":"multipart"}' \
  -F "file_ine_f=@/ruta/al/archivo.pdf"

## 10. Consultar estado de solicitud

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests/SOLICITUD_ID" \
  -H "x-api-key: TU_API_KEY"

Respuesta ejemplo:

{
  "success": true,
  "solicitud_id": "hNRBS1K2ifDsn3IgTajW",
  "external_reference": "PRUEBA-ARCHIVO-001",
  "service_code": "CURP",
  "service_name": "CURP",
  "estatus": "En Proceso",
  "finalizado": false,
  "archivoFinal": null,
  "error": null,
  "created_via": "api",
  "origen": "API"
}

## 11. Consultar resultado

Comando:

curl -X GET "https://us-central1-pensionsegura-9c817.cloudfunctions.net/api/api/v1/requests/SOLICITUD_ID/result" \
  -H "x-api-key: TU_API_KEY"

Si aun no esta listo:

{
  "success": false,
  "error_code": "RESULT_NOT_READY",
  "message": "El resultado todavía no está disponible."
}

## 12. Errores comunes

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
500 CLOUDINARY_NOT_CONFIGURED - Cloudinary no configurado.
500 INTERNAL_ERROR - Error interno.

## 13. Recomendaciones

- No guardar API Keys en frontend publico.
- Usar API Keys solo desde backend del integrador.
- Guardar solicitud_id y external_reference.
- Consultar periodicamente /requests/{id} o /requests/{id}/result.
- No reenviar la misma solicitud varias veces si la primera ya fue aceptada.
- Proteger archivos personales y documentos oficiales del cliente.

## 14. Estado operativo validado

Proyecto Firebase: pensionsegura-9c817
Function: api
Region: us-central1
Endpoint health: OK
Solicitudes JSON: OK
Solicitudes multipart/form-data con archivos: OK
Subida de archivos a Cloudinary: OK
Consulta de solicitud por ID: OK

Ultima prueba multipart validada:

solicitud_id: hNRBS1K2ifDsn3IgTajW
external_reference: PRUEBA-ARCHIVO-001
service_code: CURP
service_name: CURP
estatus: En Proceso
origen: API
created_via: api
archivo: Cloudinary URL generada correctamente
