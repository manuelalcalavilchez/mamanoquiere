"""VERI*FACTU (RD 1007/2023 y Orden HAC/1177/2024).

Lo que hace este módulo:
  - Crea el registro de facturación (alta o anulación) de cada factura, encadenado con la huella SHA-256
    del registro anterior del mismo emisor. La cadena no se reescribe nunca.
  - Genera la URL del código QR que va impresa en la factura.
  - Construye el XML de RegFactuSistemaFacturacion para la AEAT.
  - Envía los registros pendientes al servicio web de la AEAT (entorno de pruebas o producción) con el
    certificado del estudio.

Estado: el formato de la huella, el QR y el XML siguen las especificaciones publicadas; el envío real
NO se ha probado todavía contra la AEAT. Antes de activar "produccion" hay que validar en "pruebas".
"""
import hashlib
import logging
import os
import tempfile
from datetime import date, datetime
from urllib.parse import urlencode
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ContadorSerie, Factura, RegistroFacturacion, ahora

log = logging.getLogger("verifactu")
HUSO = ZoneInfo("Europe/Madrid")

QR_BASE = {"pruebas": "https://prewww2.aeat.es", "produccion": "https://www2.agenciatributaria.gob.es"}
WS_URL = {
    "pruebas": "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    "produccion": "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
}
NS_SUM = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"
NS_SUM1 = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd"
ENVIA = {"pruebas", "produccion"}


# ------------------------------------------------------------------ formato
def importe(cent: int) -> str:
    """12345 -> '123.45' (punto decimal, dos decimales, sin miles)."""
    signo = "-" if cent < 0 else ""
    cent = abs(cent)
    return f"{signo}{cent // 100}.{cent % 100:02d}"


def fecha_aeat(d: date) -> str:
    return d.strftime("%d-%m-%Y")


def ahora_con_huso() -> str:
    return datetime.now(HUSO).replace(microsecond=0).isoformat()


# ------------------------------------------------------------------ huella
def huella_alta(nif: str, num_serie: str, fecha: date, tipo: str, cuota_cent: int, total_cent: int,
                huella_anterior: str | None, fecha_hora_gen: str) -> str:
    cadena = (f"IDEmisorFactura={nif.strip()}&NumSerieFactura={num_serie.strip()}"
              f"&FechaExpedicionFactura={fecha_aeat(fecha)}&TipoFactura={tipo}"
              f"&CuotaTotal={importe(cuota_cent)}&ImporteTotal={importe(total_cent)}"
              f"&Huella={huella_anterior or ''}&FechaHoraHusoGenRegistro={fecha_hora_gen}")
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest().upper()


def huella_anulacion(nif: str, num_serie: str, fecha: date, huella_anterior: str | None, fecha_hora_gen: str) -> str:
    cadena = (f"IDEmisorFacturaAnulada={nif.strip()}&NumSerieFacturaAnulada={num_serie.strip()}"
              f"&FechaExpedicionFacturaAnulada={fecha_aeat(fecha)}"
              f"&Huella={huella_anterior or ''}&FechaHoraHusoGenRegistro={fecha_hora_gen}")
    return hashlib.sha256(cadena.encode("utf-8")).hexdigest().upper()


def _bloquear_cadena(db: Session, nif: str) -> None:
    """Serializa la creación de registros del mismo emisor (SELECT ... FOR UPDATE en PostgreSQL)."""
    clave = f"~{nif}"[:20]
    fila = db.execute(select(ContadorSerie).where(ContadorSerie.serie == clave).with_for_update()).scalar_one_or_none()
    if not fila:
        db.add(ContadorSerie(serie=clave, ultimo=0))
        db.flush()


def registrar(db: Session, f: Factura, tipo: str, modo: str) -> RegistroFacturacion:
    """Crea el registro (alta|anulacion) encadenado. No hace commit."""
    nif = f.emisor["nif"]
    _bloquear_cadena(db, nif)
    anterior = db.scalar(select(RegistroFacturacion).where(RegistroFacturacion.nif_emisor == nif)
                         .order_by(RegistroFacturacion.id.desc()).limit(1))
    previa = anterior.huella if anterior else None
    momento = ahora_con_huso()
    if tipo == "alta":
        h = huella_alta(nif, f.num_serie, f.fecha_expedicion, f.tipo, f.cuota_cent, f.total_cent, previa, momento)
    else:
        h = huella_anulacion(nif, f.num_serie, f.fecha_expedicion, previa, momento)
    r = RegistroFacturacion(tipo=tipo, factura_id=f.id, nif_emisor=nif, num_serie=f.num_serie,
                            fecha_expedicion=f.fecha_expedicion, anterior_id=anterior.id if anterior else None,
                            huella_anterior=previa, huella=h, fecha_hora_gen=momento,
                            estado_envio="pendiente" if modo in ENVIA else "no_aplica")
    db.add(r)
    db.flush()
    return r


def verificar_cadena(db: Session, nif: str) -> dict:
    """Recalcula todas las huellas del emisor y comprueba que encadenan. Sirve de auditoría."""
    regs = db.scalars(select(RegistroFacturacion).where(RegistroFacturacion.nif_emisor == nif)
                      .order_by(RegistroFacturacion.id)).all()
    previa = None
    for r in regs:
        f = db.get(Factura, r.factura_id)
        if r.tipo == "alta":
            h = huella_alta(nif, f.num_serie, f.fecha_expedicion, f.tipo, f.cuota_cent, f.total_cent, previa, r.fecha_hora_gen)
        else:
            h = huella_anulacion(nif, f.num_serie, f.fecha_expedicion, previa, r.fecha_hora_gen)
        if r.huella_anterior != previa or r.huella != h:
            return {"ok": False, "registros": len(regs), "rotura_en": r.id, "num_serie": r.num_serie}
        previa = r.huella
    return {"ok": True, "registros": len(regs), "ultima_huella": previa}


# ------------------------------------------------------------------ QR
def url_qr(f: Factura, modo: str) -> str | None:
    if modo not in ENVIA:
        return None
    q = urlencode({"nif": f.emisor["nif"], "numserie": f.num_serie, "fecha": fecha_aeat(f.fecha_expedicion),
                   "importe": importe(f.total_cent)})
    return f"{QR_BASE[modo]}/wlpl/TIKE-CONT/ValidarQR?{q}"


# ------------------------------------------------------------------ XML
def _e(tag: str, valor) -> str:
    return f"<sum1:{tag}>{escape(str(valor))}</sum1:{tag}>"


def _sistema(cfg: dict) -> str:
    s = cfg["verifactu"]["sistema"]
    return ("<sum1:SistemaInformatico>" + _e("NombreRazon", s["nombre_razon"]) + _e("NIF", s["nif"])
            + _e("NombreSistemaInformatico", s["nombre_sistema"]) + _e("IdSistemaInformatico", s["id_sistema"])
            + _e("Version", s["version"]) + _e("NumeroInstalacion", s["numero_instalacion"])
            + _e("TipoUsoPosibleSoloVerifactu", "S") + _e("TipoUsoPosibleMultiOT", "N")
            + _e("IndicadorMultiplesOT", "N") + "</sum1:SistemaInformatico>")


def _encadenamiento(db: Session, r: RegistroFacturacion) -> str:
    if not r.anterior_id:
        return "<sum1:Encadenamiento>" + _e("PrimerRegistro", "S") + "</sum1:Encadenamiento>"
    a = db.get(RegistroFacturacion, r.anterior_id)
    return ("<sum1:Encadenamiento><sum1:RegistroAnterior>" + _e("IDEmisorFactura", a.nif_emisor)
            + _e("NumSerieFactura", a.num_serie) + _e("FechaExpedicionFactura", fecha_aeat(a.fecha_expedicion))
            + _e("Huella", a.huella) + "</sum1:RegistroAnterior></sum1:Encadenamiento>")


def xml_registro(db: Session, r: RegistroFacturacion, cfg: dict) -> str:
    f = db.get(Factura, r.factura_id)
    if r.tipo == "anulacion":
        return ("<sum:RegistroFactura><sum1:RegistroAnulacion>" + _e("IDVersion", "1.0")
                + "<sum1:IDFactura>" + _e("IDEmisorFacturaAnulada", f.emisor["nif"])
                + _e("NumSerieFacturaAnulada", f.num_serie)
                + _e("FechaExpedicionFacturaAnulada", fecha_aeat(f.fecha_expedicion)) + "</sum1:IDFactura>"
                + _encadenamiento(db, r) + _sistema(cfg) + _e("FechaHoraHusoGenRegistro", r.fecha_hora_gen)
                + _e("TipoHuella", "01") + _e("Huella", r.huella) + "</sum1:RegistroAnulacion></sum:RegistroFactura>")
    x = ["<sum:RegistroFactura><sum1:RegistroAlta>", _e("IDVersion", "1.0"),
         "<sum1:IDFactura>", _e("IDEmisorFactura", f.emisor["nif"]), _e("NumSerieFactura", f.num_serie),
         _e("FechaExpedicionFactura", fecha_aeat(f.fecha_expedicion)), "</sum1:IDFactura>",
         _e("NombreRazonEmisor", f.emisor["razon_social"])]
    if r.subsanacion:
        x.append(_e("Subsanacion", "S"))
    x.append(_e("TipoFactura", f.tipo))
    if f.tipo.startswith("R"):
        x.append(_e("TipoRectificativa", f.tipo_rectificacion or "I"))
        orig = db.get(Factura, f.rectificada_id)
        x += ["<sum1:FacturasRectificadas><sum1:IDFacturaRectificada>", _e("IDEmisorFactura", orig.emisor["nif"]),
              _e("NumSerieFactura", orig.num_serie), _e("FechaExpedicionFactura", fecha_aeat(orig.fecha_expedicion)),
              "</sum1:IDFacturaRectificada></sum1:FacturasRectificadas>"]
        if f.tipo_rectificacion == "S":
            x += ["<sum1:ImporteRectificacion>", _e("BaseRectificada", importe(orig.base_cent)),
                  _e("CuotaRectificada", importe(orig.cuota_cent)), "</sum1:ImporteRectificacion>"]
    if f.fecha_operacion and f.fecha_operacion != f.fecha_expedicion:
        x.append(_e("FechaOperacion", fecha_aeat(f.fecha_operacion)))
    x.append(_e("DescripcionOperacion", f.descripcion[:500]))
    d = f.destinatario or {}
    if d.get("nif") and f.tipo not in ("F2", "R5"):
        x += ["<sum1:Destinatarios><sum1:IDDestinatario>", _e("NombreRazon", d.get("nombre", ""))]
        if (d.get("pais") or "ES") == "ES":
            x.append(_e("NIF", d["nif"]))
        else:  # extranjero: pasaporte u otro documento
            x += ["<sum1:IDOtro>", _e("CodigoPais", d["pais"]), _e("IDType", d.get("tipo_id") or "03"),
                  _e("ID", d["nif"]), "</sum1:IDOtro>"]
        x.append("</sum1:IDDestinatario></sum1:Destinatarios>")
    x.append("<sum1:Desglose>")
    for g in f.desglose:
        x += ["<sum1:DetalleDesglose>", _e("Impuesto", "01"), _e("ClaveRegimen", "01"),
              _e("CalificacionOperacion", "S1"), _e("TipoImpositivo", f"{g['iva_x100'] // 100}.{g['iva_x100'] % 100:02d}"),
              _e("BaseImponibleOimporteNoSujeto", importe(g["base_cent"])),
              _e("CuotaRepercutida", importe(g["cuota_cent"])), "</sum1:DetalleDesglose>"]
    x.append("</sum1:Desglose>")
    x += [_e("CuotaTotal", importe(f.cuota_cent)), _e("ImporteTotal", importe(f.total_cent)),
          _encadenamiento(db, r), _sistema(cfg), _e("FechaHoraHusoGenRegistro", r.fecha_hora_gen),
          _e("TipoHuella", "01"), _e("Huella", r.huella), "</sum1:RegistroAlta></sum:RegistroFactura>"]
    return "".join(x)


def sobre_soap(db: Session, registros: list[RegistroFacturacion], cfg: dict) -> str:
    em = cfg["emisor"]
    cuerpo = "".join(xml_registro(db, r, cfg) for r in registros)
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
            f'xmlns:sum="{NS_SUM}" xmlns:sum1="{NS_SUM1}"><soapenv:Header/><soapenv:Body>'
            "<sum:RegFactuSistemaFacturacion><sum:Cabecera><sum1:ObligadoEmision>"
            + _e("NombreRazon", em["razon_social"]) + _e("NIF", em["nif"])
            + "</sum1:ObligadoEmision></sum:Cabecera>" + cuerpo
            + "</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>")


# ------------------------------------------------------------------ envío
def _pem_desde_pfx(ruta: str, password: str) -> tuple[str, str]:
    from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, pkcs12

    clave, cert, extra = pkcs12.load_key_and_certificates(open(ruta, "rb").read(), password.encode() or None)
    carpeta = tempfile.mkdtemp(prefix="vf-")
    c, k = os.path.join(carpeta, "c.pem"), os.path.join(carpeta, "k.pem")
    with open(c, "wb") as fh:
        fh.write(cert.public_bytes(Encoding.PEM) + b"".join(x.public_bytes(Encoding.PEM) for x in extra or []))
    with open(k, "wb") as fh:
        fh.write(clave.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
    os.chmod(k, 0o600)
    return c, k


def _texto(xml: str, tag: str) -> str | None:
    i = xml.find(f":{tag}>")
    if i < 0:
        return None
    j = xml.find("</", i)
    return xml[i + len(tag) + 2:j]


def enviar_pendientes(db: Session, cfg: dict, limite: int = 1000) -> dict:
    """Envía en orden de cadena los registros pendientes. Devuelve un resumen."""
    import httpx

    vf = cfg["verifactu"]
    modo = vf["modo"]
    if modo not in ENVIA:
        return {"enviados": 0, "motivo": f"Modo {modo}: no se envía a la AEAT"}
    if not vf.get("certificado_pfx") or not os.path.exists(vf["certificado_pfx"]):
        return {"enviados": 0, "motivo": "Falta el certificado (.pfx) en el servidor"}
    regs = db.scalars(select(RegistroFacturacion).where(RegistroFacturacion.estado_envio == "pendiente")
                      .order_by(RegistroFacturacion.id).limit(limite)).all()
    if not regs:
        return {"enviados": 0, "motivo": "No hay registros pendientes"}
    cert, key = _pem_desde_pfx(vf["certificado_pfx"], os.environ.get(vf.get("certificado_password_env", ""), ""))
    try:
        r = httpx.post(WS_URL[modo], content=sobre_soap(db, regs, cfg).encode("utf-8"), cert=(cert, key), timeout=60,
                       headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": ""})
        texto = r.text
    except Exception as e:  # noqa: BLE001
        for x in regs:
            x.intentos += 1
            x.respuesta = f"Error de conexión: {e}"
        db.commit()
        return {"enviados": 0, "motivo": f"Error de conexión: {e}"}
    finally:
        for p in (cert, key):
            try:
                os.remove(p)
            except OSError:
                pass
    estado_global = _texto(texto, "EstadoEnvio")  # Correcto | ParcialmenteCorrecto | Incorrecto
    csv = _texto(texto, "CSV")
    # Respuesta por línea: se busca cada NumSerieFactura en la respuesta
    for x in regs:
        x.intentos += 1
        x.enviado = ahora()
        x.respuesta = texto[:20000]
        tramo = texto[texto.find(x.num_serie):] if x.num_serie in texto else ""
        est = _texto(tramo, "EstadoRegistro") if tramo else None
        x.estado_envio = {"Correcto": "correcto", "AceptadoConErrores": "aceptado_con_errores",
                          "Incorrecto": "incorrecto"}.get(est or estado_global or "", "enviado")
        x.csv_aeat = csv
    db.commit()
    return {"enviados": len(regs), "estado": estado_global, "http": r.status_code}
