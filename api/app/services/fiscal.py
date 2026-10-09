"""Cálculos fiscales: IVA, descuentos y desglose. Todo en céntimos enteros."""
import copy
from datetime import date

from .. import defaults
from ..models import Ajustes, Descuento


def _fusionar(base: dict, extra: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (extra or {}).items():
        out[k] = _fusionar(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def config_fiscal(ajustes: Ajustes) -> dict:
    """Configuración efectiva: valores por defecto + lo guardado por el estudio."""
    return _fusionar(defaults.FACTURACION, ajustes.facturacion or {})


def redondear(num: int, den: int) -> int:
    """División entera con redondeo a la mitad hacia arriba (sin errores de coma flotante)."""
    q, r = divmod(num * 2 + den, den * 2)
    return q


def desglosar(total_cent: int, iva_x100: int, con_iva: bool = True) -> tuple[int, int]:
    """Devuelve (base, cuota). Con precio IVA incluido: base = total / (1 + tipo)."""
    if con_iva:
        base = redondear(total_cent * 10000, 10000 + iva_x100)
        return base, total_cent - base
    cuota = redondear(total_cent * iva_x100, 10000)
    return total_cent, cuota


def calcular_descuento(precio_cent: int, *, descuento: Descuento | None = None, pct: int | None = None,
                       importe_cent: int | None = None) -> int:
    if descuento:
        if descuento.tipo == "porcentaje":
            return redondear(precio_cent * descuento.valor, 100)
        return min(descuento.valor, precio_cent)
    if pct:
        return redondear(precio_cent * pct, 100)
    return min(importe_cent or 0, precio_cent)


def descuento_vigente(d: Descuento, hoy: date) -> bool:
    return d.activo and (d.desde is None or d.desde <= hoy) and (d.hasta is None or d.hasta >= hoy)


def desglose_por_tipo(lineas: list[tuple[int, int]], con_iva: bool = True) -> list[dict]:
    """lineas = [(importe_cent, iva_x100)]. Agrupa por tipo y calcula base/cuota por grupo,
    que es lo que se declara (evita descuadres de redondeo línea a línea)."""
    grupos: dict[int, int] = {}
    for importe, tipo in lineas:
        grupos[tipo] = grupos.get(tipo, 0) + importe
    out = []
    for tipo in sorted(grupos, reverse=True):
        base, cuota = desglosar(grupos[tipo], tipo, con_iva)
        out.append({"iva_x100": tipo, "base_cent": base, "cuota_cent": cuota})
    return out
