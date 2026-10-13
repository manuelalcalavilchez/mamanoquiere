"""Preparación de las fotos que se suben (trabajos, portada, logo).

- Orientación correcta (aplica la rotación EXIF del móvil).
- Sin metadatos: se quitan GPS, modelo del móvil, fecha, etc. antes de publicar.
- Tamaño web: el lado mayor se limita (por defecto 2000 px) y se recomprime.
- Acepta JPG, PNG, WEBP, AVIF y HEIC/HEIF (fotos de iPhone sin convertir).
"""
import io

from PIL import Image, ImageOps

try:  # HEIC/HEIF de iPhone
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # pragma: no cover - si falta la librería, HEIC se rechaza con un mensaje claro
    pass

MAX_LADO = 2000
TIPOS = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"}
EXTENSIONES = (".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif")


class ImagenInvalida(ValueError):
    pass


def parece_imagen(content_type: str | None, nombre: str | None) -> bool:
    """Algunos navegadores mandan HEIC como application/octet-stream: se mira también la extensión."""
    return (content_type or "") in TIPOS or (nombre or "").lower().endswith(EXTENSIONES)


def preparar(datos: bytes, max_lado: int = MAX_LADO) -> tuple[bytes, str]:
    """Devuelve (bytes, extensión) listos para servir en la web."""
    try:
        im = Image.open(io.BytesIO(datos))
        im.load()
    except Exception as e:  # noqa: BLE001 - cualquier fallo de lectura es "imagen no válida"
        raise ImagenInvalida("No se reconoce la imagen. Usa JPG, PNG, WEBP o HEIC.") from e
    im = ImageOps.exif_transpose(im)
    transparente = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im.thumbnail((max_lado, max_lado), Image.LANCZOS)
    out = io.BytesIO()
    if transparente:  # logos con fondo transparente
        im.convert("RGBA").save(out, "WEBP", quality=88, method=4)
        return out.getvalue(), ".webp"
    im.convert("RGB").save(out, "JPEG", quality=84, optimize=True, progressive=True)
    return out.getvalue(), ".jpg"
