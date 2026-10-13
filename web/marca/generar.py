"""Genera los recursos de marca de la web a partir del logo original (marca/logo-origen.webp).

Uso (desde web/):  python marca/generar.py
Necesita Pillow. Si llega un logo con más resolución o vectorial, sustituye logo-origen.webp
(cuadrado, fondo negro) y vuelve a ejecutarlo: las proporciones se recalculan.
"""
from pathlib import Path

import numpy as np
from PIL import Image

BASE = Path(__file__).resolve().parent
SALIDA = BASE.parent / "public" / "marca"
NEGRO = (7, 7, 7, 255)


def transparente(img: Image.Image) -> Image.Image:
    """El fondo negro pasa a transparente (para usarlo sobre cualquier fondo oscuro)."""
    a = np.asarray(img.convert("RGB")).astype(float)
    alfa = np.clip((a.max(2) - 12) / 50, 0, 1)
    rgb = a * (1 - alfa[..., None]) + np.clip(a / np.maximum(alfa[..., None], 1e-3), 0, 255) * alfa[..., None]
    return Image.fromarray(np.dstack([rgb, alfa * 255]).astype(np.uint8), "RGBA")


def franja(t: Image.Image, y0: float, y1: float, x0: float = 0, x1: float = 1) -> Image.Image:
    """Recorta una zona (en proporciones del logo) y la ajusta a su contenido."""
    w, h = t.size
    z = t.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    return z.crop(z.getbbox())


def icono(em: Image.Image, n: int, margen: float = 0.08) -> Image.Image:
    c = Image.new("RGBA", (n, n), NEGRO)
    e = em.copy()
    lado = int(n * (1 - 2 * margen))
    e.thumbnail((lado, lado), Image.LANCZOS)
    c.alpha_composite(e, ((n - e.width) // 2, (n - e.height) // 2))
    return c


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    origen = Image.open(BASE / "logo-origen.webp").convert("RGB")
    t = transparente(origen)
    # Zonas del logo (proporciones sobre el cuadrado): título, emblema (llama + corazón)
    titulo = franja(t, 0.048, 0.148)
    emblema = franja(t, 0.212, 0.89, 0.257, 0.752)

    t.save(SALIDA / "logo.webp", quality=90)
    emblema.save(SALIDA / "emblema.webp", quality=90)
    titulo.save(SALIDA / "titulo.webp", quality=92)

    icono(emblema, 180).convert("RGB").save(SALIDA / "apple-touch-icon.png", optimize=True)
    icono(emblema, 64, 0.02).save(SALIDA.parent / "favicon.png", optimize=True)
    icono(emblema, 48, 0.02).save(SALIDA.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    og = Image.new("RGB", (1200, 630), NEGRO[:3])
    cuadro = origen.copy()
    cuadro.thumbnail((620, 620), Image.LANCZOS)
    og.paste(cuadro, ((1200 - cuadro.width) // 2, (630 - cuadro.height) // 2))
    og.save(SALIDA / "og.jpg", quality=86)
    print("Generado en", SALIDA, "· título", titulo.size, "· emblema", emblema.size)


if __name__ == "__main__":
    main()
