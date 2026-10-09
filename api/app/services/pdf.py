import base64
import io
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from ..models import Ajustes, Cliente, Consentimiento


def _decode_firma(firma: str) -> bytes:
    if "," in firma and firma.startswith("data:"):
        firma = firma.split(",", 1)[1]
    return base64.b64decode(firma)


def generar_consentimiento(c: Consentimiento, cliente: Cliente, ajustes: Ajustes, destino: Path) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(destino), pagesize=A4)
    w, h = A4
    y = h - 25 * mm
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(20 * mm, y, f"{ajustes.nombre_estudio} — Consentimiento informado")
    y -= 10 * mm
    pdf.setFont("Helvetica", 10)
    for linea in [
        f"Cliente: {cliente.nombre}",
        f"Documento: {cliente.documento or '-'}   Nacimiento: {cliente.fecha_nacimiento or '-'}",
        f"Email: {cliente.email or '-'}   Teléfono: {cliente.telefono or '-'}",
        f"Fecha: {c.creado:%d/%m/%Y %H:%M}",
    ]:
        pdf.drawString(20 * mm, y, linea)
        y -= 6 * mm
    y -= 4 * mm
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Declaración de salud")
    y -= 7 * mm
    pdf.setFont("Helvetica", 10)
    textos = {p["id"]: p["texto"] for p in ajustes.preguntas_consentimiento}
    for pid, resp in c.respuestas.items():
        valor = resp if not isinstance(resp, dict) else f"{resp.get('valor')} {resp.get('detalle') or ''}"
        if isinstance(valor, bool):
            valor = "Sí" if valor else "No"
        pdf.drawString(22 * mm, y, f"{textos.get(pid, pid)}: {valor}")
        y -= 6 * mm
    if ajustes.texto_legal:
        y -= 4 * mm
        t = pdf.beginText(20 * mm, y)
        t.setFont("Helvetica", 8)
        for parrafo in ajustes.texto_legal.splitlines():
            while parrafo:
                t.textLine(parrafo[:110])
                parrafo = parrafo[110:]
        pdf.drawText(t)
        y = t.getY() - 6 * mm
    try:
        img = ImageReader(io.BytesIO(_decode_firma(c.firma_png)))
        pdf.drawString(20 * mm, y, "Firma:")
        pdf.drawImage(img, 20 * mm, y - 32 * mm, width=70 * mm, height=28 * mm, mask="auto")
    except Exception:
        pdf.drawString(20 * mm, y, "Firma: [no legible]")
    pdf.showPage()
    pdf.save()
    return destino


# ------------------------------------------------------------------ factura
TIPOS_FACTURA = {"F1": "FACTURA", "F2": "FACTURA SIMPLIFICADA", "R1": "FACTURA RECTIFICATIVA",
                 "R2": "FACTURA RECTIFICATIVA", "R3": "FACTURA RECTIFICATIVA", "R4": "FACTURA RECTIFICATIVA",
                 "R5": "FACTURA RECTIFICATIVA (SIMPLIFICADA)"}


def _eur(cent: int) -> str:
    s = f"{abs(cent) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if cent < 0 else "") + s + " €"


def _pct(x100: int) -> str:
    return f"{x100 / 100:g}".replace(".", ",") + " %"


def generar_factura(f, nombre_comercial: str, qr_url: str | None, original_num: str | None = None,
                    pie: str = "") -> bytes:
    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing

    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    pdf.setTitle(f"{TIPOS_FACTURA.get(f.tipo, 'FACTURA')} {f.num_serie}")
    w, h = A4
    x0, x1 = 18 * mm, w - 18 * mm
    y = h - 22 * mm

    # QR VERI*FACTU al inicio de la factura (ISO/IEC 18004, corrección M, entre 30 y 40 mm)
    if qr_url:
        lado = 32 * mm
        qr = QrCodeWidget(qr_url, barLevel="M")
        b = qr.getBounds()
        dib = Drawing(lado, lado, transform=[lado / (b[2] - b[0]), 0, 0, lado / (b[3] - b[1]), 0, 0])
        dib.add(qr)
        base_qr = h - 12 * mm - lado
        renderPDF.draw(dib, pdf, x0 - 2 * mm, base_qr)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(x0 + lado + 2 * mm, base_qr + lado / 2 + 2 * mm, "VERI*FACTU")
        pdf.setFont("Helvetica", 8)
        pdf.drawString(x0 + lado + 2 * mm, base_qr + lado / 2 - 3 * mm, "Factura verificable en la sede electrónica de la AEAT")
        y = base_qr - 8 * mm

    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(x0, y, nombre_comercial)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawRightString(x1, y, TIPOS_FACTURA.get(f.tipo, "FACTURA"))
    y -= 6 * mm
    yd = y
    em = f.emisor
    pdf.setFont("Helvetica", 9)
    for linea in [em.get("razon_social", ""), f"NIF {em.get('nif', '')}", em.get("domicilio", ""),
                  " ".join(x for x in [em.get("codigo_postal"), em.get("localidad"), em.get("provincia")] if x)]:
        if linea.strip():
            pdf.drawString(x0, y, linea)
            y -= 4.5 * mm
    pdf.setFont("Helvetica", 9)
    for k, v in [("Número", f.num_serie), ("Fecha de expedición", f.fecha_expedicion.strftime("%d/%m/%Y"))] + (
            [("Fecha de operación", f.fecha_operacion.strftime("%d/%m/%Y"))]
            if f.fecha_operacion and f.fecha_operacion != f.fecha_expedicion else []) + (
            [("Rectifica a", original_num)] if original_num else []):
        pdf.drawRightString(x1, yd, f"{k}: {v}")
        yd -= 4.5 * mm
    y = min(y, yd) - 4 * mm

    d = f.destinatario or {}
    if d:
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawString(x0, y, "Cliente")
        y -= 4.5 * mm
        pdf.setFont("Helvetica", 9)
        doc = d.get("nif")
        for linea in [d.get("nombre", ""), (("NIF " if (d.get("pais") or "ES") == "ES" else "Doc. ") + doc) if doc else "",
                      d.get("domicilio") or "", " ".join(x for x in [d.get("codigo_postal"), d.get("localidad")] if x)]:
            if linea.strip():
                pdf.drawString(x0, y, linea)
                y -= 4.5 * mm
        y -= 3 * mm

    # Líneas
    cols = [x0, x0 + 100 * mm, x0 + 118 * mm, x0 + 140 * mm, x1]
    pdf.setFillColorRGB(0.93, 0.93, 0.93)
    pdf.rect(x0, y - 1.8 * mm, x1 - x0, 6 * mm, stroke=0, fill=1)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(cols[0] + 1 * mm, y, "Concepto")
    pdf.drawRightString(cols[2] - 1 * mm, y, "Precio")
    pdf.drawRightString(cols[3] - 1 * mm, y, "Dto.")
    pdf.drawRightString(cols[3] + 9 * mm, y, "IVA")
    pdf.drawRightString(cols[4] - 1 * mm, y, "Importe")
    y -= 6.5 * mm
    pdf.setFont("Helvetica", 8.5)
    for l in f.lineas:
        if y < 60 * mm:
            pdf.showPage()
            y = h - 22 * mm
            pdf.setFont("Helvetica", 8.5)
        cant = f"{l.cantidad} × " if l.cantidad != 1 else ""
        pdf.drawString(cols[0] + 1 * mm, y, (cant + l.descripcion)[:70])
        pdf.drawRightString(cols[2] - 1 * mm, y, _eur(l.precio_cent))
        pdf.drawRightString(cols[3] - 1 * mm, y, _eur(-l.descuento_cent) if l.descuento_cent else "")
        pdf.drawRightString(cols[3] + 9 * mm, y, _pct(l.iva_x100))
        pdf.drawRightString(cols[4] - 1 * mm, y, _eur(l.total_cent))
        y -= 5.2 * mm
    pdf.line(x0, y + 2 * mm, x1, y + 2 * mm)
    y -= 4 * mm

    # Desglose de IVA y total
    pdf.setFont("Helvetica-Bold", 8.5)
    xs = [x1 - 75 * mm, x1 - 50 * mm, x1 - 25 * mm, x1]
    for x, t in zip(xs, ["Base imponible", "Tipo", "Cuota IVA"]):
        pdf.drawRightString(x + 24 * mm, y, t)
    y -= 5 * mm
    pdf.setFont("Helvetica", 8.5)
    for g in f.desglose:
        pdf.drawRightString(xs[0] + 24 * mm, y, _eur(g["base_cent"]))
        pdf.drawRightString(xs[1] + 24 * mm, y, _pct(g["iva_x100"]))
        pdf.drawRightString(xs[2] + 24 * mm, y, _eur(g["cuota_cent"]))
        y -= 5 * mm
    y -= 2 * mm
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawRightString(x1, y, f"TOTAL  {_eur(f.total_cent)}")
    y -= 6 * mm
    pdf.setFont("Helvetica", 8.5)
    if f.tipo in ("F2", "R5"):
        pdf.drawRightString(x1, y, "IVA incluido")
        y -= 5 * mm
    if f.forma_pago:
        pdf.drawString(x0, y, f"Forma de pago: {f.forma_pago.capitalize()}")
        y -= 5 * mm
    if f.motivo and f.tipo.startswith("R"):
        pdf.drawString(x0, y, f"Motivo de la rectificación: {f.motivo}"[:110])
        y -= 5 * mm
    if f.estado == "anulada":
        pdf.setFont("Helvetica-Bold", 30)
        pdf.setFillColorRGB(0.8, 0.1, 0.1)
        pdf.drawCentredString(w / 2, h / 2, "ANULADA")
        pdf.setFillColorRGB(0, 0, 0)

    if pie:
        pdf.setFont("Helvetica", 7.5)
        pdf.drawString(x0, 14 * mm, pie[:150])
    pdf.showPage()
    pdf.save()
    return buf.getvalue()
