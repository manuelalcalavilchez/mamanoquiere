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
