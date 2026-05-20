# Paquete de entrega para cliente B2B

Este paquete contiene los documentos y archivos necesarios para integrar la API B2B de DPR Pension Segura.

## Archivos para entregar

1. DPR_API_B2B_GUIA_CLIENTE.pdf
Documento formal de integracion para cliente.

2. DPR_API_B2B.postman_collection.json
Coleccion Postman para probar endpoints.

3. DPR_API_B2B.postman_environment.json
Environment Postman con variables BASE_URL, API_KEY y SOLICITUD_ID.

4. API Key
Debe entregarse por canal seguro y separado.

## Instrucciones para el cliente

1. Importar la coleccion Postman.
2. Importar el environment Postman.
3. Seleccionar environment DPR API B2B - Production.
4. Reemplazar API_KEY por la clave entregada.
5. Ejecutar Health.
6. Ejecutar Balance.
7. Ejecutar Services.
8. Crear una solicitud de prueba.
9. Consultar la solicitud creada.
10. Conservar solicitud_id para seguimiento.

## Seguridad

La API Key no debe colocarse en frontend publico ni repositorios.

Si se expone la API Key, se debe solicitar una nueva inmediatamente.
