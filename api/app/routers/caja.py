from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import CierreCaja, Usuario
from ..security import es_gestion, solo_gestion, usuario_actual
from ..services.caja import dia_cerrado, resumen_dia

router = APIRouter(prefix="/caja", tags=["caja"])


@router.get("/resumen")
def resumen(tienda_id: int, fecha: date, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    cierre = db.scalar(select(CierreCaja).where(CierreCaja.tienda_id == tienda_id, CierreCaja.fecha == fecha))
    data = cierre.resumen if cierre else resumen_dia(db, tienda_id, fecha)
    data = {**data, "cerrado": cierre is not None}
    if not es_gestion(user):  # un profesional solo ve su línea
        data["personas"] = [p for p in data["personas"] if p["usuario_id"] == user.id]
        for k in ("facturado_cent", "profesionales_cent", "estudio_cent", "por_forma_pago", "iva", "base_cent",
                  "cuota_iva_cent", "descuentos_cent", "sin_factura"):
            data.pop(k, None)
    return data


@router.post("/cierres")
def cerrar(tienda_id: int, fecha: date, db: Session = Depends(get_db), user: Usuario = Depends(solo_gestion)):
    if dia_cerrado(db, tienda_id, fecha):
        raise HTTPException(409, "Ese día ya está cerrado")
    cierre = CierreCaja(tienda_id=tienda_id, fecha=fecha, resumen=resumen_dia(db, tienda_id, fecha),
                        cerrado_por=user.id)
    db.add(cierre)
    db.commit()
    return {"id": cierre.id, **cierre.resumen}


@router.delete("/cierres", status_code=204)
def reabrir(tienda_id: int, fecha: date, db: Session = Depends(get_db), user: Usuario = Depends(solo_gestion)):
    cierre = db.scalar(select(CierreCaja).where(CierreCaja.tienda_id == tienda_id, CierreCaja.fecha == fecha))
    if not cierre:
        raise HTTPException(404, "No hay cierre ese día")
    db.delete(cierre)
    db.commit()


@router.get("/export.csv")
def exportar_csv(tienda_id: int, desde: date, hasta: date, db: Session = Depends(get_db),
                 user: Usuario = Depends(solo_gestion)):
    """Trabajos del periodo en CSV (se abre en Excel)."""
    import csv
    import io

    from fastapi.responses import StreamingResponse

    from ..models import Trabajo
    filas = db.scalars(select(Trabajo).where(Trabajo.tienda_id == tienda_id, Trabajo.fecha >= desde,
                                             Trabajo.fecha <= hasta).order_by(Trabajo.fecha)).all()
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["fecha", "profesional", "servicio", "descripcion", "precio", "descuento", "motivo descuento",
                "importe", "base", "IVA %", "cuota IVA", "pago", "%", "profesional €", "estudio €", "factura"])
    from ..models import Factura

    def e(c):
        return f"{(c or 0) / 100:.2f}".replace(".", ",")
    for t in filas:
        num = db.get(Factura, t.factura_id).num_serie if t.factura_id else ""
        w.writerow([t.fecha, t.usuario.nombre, t.tipo_servicio.value, t.descripcion or "", e(t.precio_cent or t.importe_cent),
                    e(t.descuento_cent), t.descuento_motivo or "", e(t.importe_cent), e(t.base_cent),
                    f"{(t.iva_x100 or 0) / 100:g}".replace(".", ","), e(t.cuota_iva_cent), t.forma_pago.value,
                    t.porcentaje, e(t.profesional_cent), e(t.estudio_cent), num])
    return StreamingResponse(iter(["\ufeff" + buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=caja_{desde}_{hasta}.csv"})
