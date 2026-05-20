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

## 5. Servicios disponibles

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
