# Facturación, IVA, descuentos y VERI*FACTU

Módulo **Facturación** de la app (`/app/facturacion`), visible para Administración y Encargado.

## Qué hace

| Pieza | Cómo funciona |
| --- | --- |
| **IVA** | Cada trabajo guarda su tipo de IVA, base y cuota al registrarse. El tipo sale de *Datos fiscales* por servicio (por defecto 21 % en tatuaje, piercing y producto; **a validar con la asesoría**). Los precios se entienden con IVA incluido (configurable). |
| **Descuentos** | Catálogo de descuentos (porcentaje o importe, con vigencia opcional y marcados como "solo gestión" si hace falta). Además se puede poner uno a mano con motivo obligatorio. Un profesional no puede pasar del tope configurado (15 % por defecto). El trabajo guarda precio de tarifa, descuento, motivo y lo cobrado. |
| **Comisión** | Se calcula sobre lo cobrado tras el descuento. Opción: sobre el total con IVA (como hasta ahora) o sobre la base sin IVA. **Decisión del estudio.** |
| **Tickets (F2)** | Factura simplificada. Botón *Ticket* en cada trabajo o desde *Nueva factura*. Límite 400 € IVA incl. (configurable); por encima obliga a factura completa. |
| **Facturas (F1)** | Con nombre, NIF (o pasaporte si es extranjero) y domicilio del cliente. Se puede agrupar varios trabajos y añadir líneas libres (productos). |
| **Rectificativas** | R4 (devolución, error de importe…), R1-R3 para los supuestos del art. 80 LIVA, R5 para tickets. Por diferencias: devolución total o un ajuste concreto. La original queda marcada como *rectificada*. |
| **Anulación** | Solo Administración, para facturas que no debieron emitirse. No reutiliza el número y deja los trabajos pendientes de facturar. |
| **Numeración** | Serie = tipo + estudio + año, correlativa sin huecos (contador bloqueado al emitir). Ej.: `TP26-00001` (ticket Puerto), `FB26-00003` (factura Beach), `RP26-00001`. |
| **Inmutabilidad** | Una factura emitida no se edita ni se borra. Un trabajo facturado no se puede anular. El NIF del emisor queda bloqueado tras la primera factura. |
| **IVA y libro** | Resumen por trimestre (base y cuota por tipo, lo que alimenta el IVA repercutido del 303) y libro registro de facturas expedidas en CSV para la asesoría. Avisa de trabajos cobrados sin ticket. |
| **Caja** | Muestra IVA incluido, base por tipo, descuentos del día y trabajos sin ticket. El CSV de caja incluye precio, descuento, base, IVA y número de factura. |

## VERI*FACTU

Obligatorio desde el **1 de enero de 2027** para sociedades y el **1 de julio de 2027** para el resto (RDL 15/2025).

Ya implementado:

- **Registro de facturación** por cada alta y anulación, con huella SHA-256 encadenada por NIF emisor. El formato de la huella está comprobado con el ejemplo publicado por la AEAT (test `test_huella_ejemplo_aeat`). La cadena se puede auditar en *VERI*FACTU → Cadena de huellas*.
- **QR** con la URL de cotejo de la AEAT (pruebas o producción), impreso al inicio del PDF con la leyenda "VERI*FACTU".
- **XML** `RegFactuSistemaFacturacion` (alta, anulación, rectificativas, destinatario nacional o extranjero) — descargable en `/api/facturas/{id}/xml`.
- **Envío** por servicio web SOAP con el certificado del estudio, manual (botón) o automático al emitir.

Modos (en *Facturación → VERI*FACTU*):

| Modo | Uso |
| --- | --- |
| `desactivado` | No genera registros. |
| `preparado` (por defecto) | Genera y encadena registros, sin QR ni envío. Para usar hasta la fecha obligatoria. |
| `pruebas` | Envía al entorno de pruebas de la AEAT; QR de pruebas. |
| `produccion` | Envía a la AEAT. Desde un modo con envío no se puede volver atrás. |

### Pendiente antes de producción

1. **Validar el XML contra los XSD oficiales** de la AEAT y hacer un envío real en el entorno de pruebas con un certificado (el envío está programado pero no se ha probado contra la AEAT).
2. Ajustar el control de flujo que marca la AEAT (tiempo de espera entre envíos) y la subsanación de registros rechazados.
3. **Declaración responsable** del sistema informático: la firma el productor del software (quien desarrolla y mantiene la app). Rellenar sus datos en *Sistema informático*.
4. Revisar con la asesoría: tipos de IVA, si alguna venta va exenta, el límite del ticket y el texto del pie.

### Certificado

1. Copia el `.pfx` al volumen `media` del servidor, por ejemplo `/data/media/certs/estudio.pfx` (no al repositorio).
2. Pon la contraseña en `VERIFACTU_CERT_PASSWORD` del `.env` y vuelve a desplegar.
3. En la app, indica la ruta del certificado y cambia el modo a `pruebas`.

## Notas

- Las devoluciones hechas con rectificativa no restan de la caja del día (la caja cuenta trabajos cobrados); la devolución de dinero se refleja en el IVA y el libro.
- El IVA soportado (compras) no está en la app: el 303 completo lo prepara la asesoría.
