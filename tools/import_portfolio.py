#!/usr/bin/env python3
"""
Importa fotos al portfolio (Directus) como material DEMO: solo se ven en staging
(SHOW_PENDING=true). En producción no se publican hasta marcar cada foto como
pública con autorización del cliente.

Uso:
  pip install requests pillow instaloader

  # A) Desde el Instagram del estudio (con permiso del estudio).
  #    Instagram bloquea peticiones anónimas: inicia sesión con una cuenta.
  python import_portfolio.py instagram <perfil> --login <tu_usuario> --limit 40

  # B) Desde una carpeta (fotos que te pase el estudio o export de Instagram)
  python import_portfolio.py folder ./fotos --limit 40

Variables: DIRECTUS_URL, ADMIN_EMAIL, ADMIN_PASSWORD
"""
import argparse, io, os, re, sys, time
from pathlib import Path

import requests
from PIL import Image, ImageOps

URL = os.environ.get("DIRECTUS_URL", "http://localhost:8055").rstrip("/")
S = requests.Session()


def login():
    r = S.post(f"{URL}/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]})
    r.raise_for_status()
    S.headers["Authorization"] = "Bearer " + r.json()["data"]["access_token"]


def get(path, **params):
    r = S.get(URL + path, params=params); r.raise_for_status(); return r.json()["data"]


def folder_id(name="web-publica"):
    d = get("/folders", **{"filter[name][_eq]": name, "limit": 1})
    if not d:
        sys.exit("Falta la carpeta 'web-publica': ejecuta antes directus/bootstrap.mjs")
    return d[0]["id"]


def artists_by_handle():
    out = {}
    for a in get("/items/artists", fields="id,instagram", limit=-1):
        if a.get("instagram"):
            out[a["instagram"].lstrip("@").lower()] = a["id"]
    return out


def already_imported(source_id):
    return bool(get("/items/artist_gallery", **{"filter[source_url][_eq]": source_id, "limit": 1, "fields": "id"}))


def prepare(raw: bytes):
    """Normaliza orientación, limita a 2000 px y recomprime a JPEG."""
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    im.thumbnail((2000, 2000))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue(), im.size


def upload(raw, name, folder, idx, featured, caption, source, handles):
    data, (w, h) = prepare(raw)
    r = S.post(f"{URL}/files", files={"file": (name, data, "image/jpeg")},
               data={"folder": folder, "title": (caption or name)[:200]})
    r.raise_for_status()
    file_id = r.json()["data"]["id"]
    artist = None
    for m in re.findall(r"@([\w.]+)", caption or ""):
        artist = artist or handles.get(m.lower())
    item = {"file": file_id, "width": w, "height": h, "demo": True, "is_public": False,
            "is_featured": idx < featured, "sort": idx, "caption": (caption or "")[:2000],
            "source_url": source, "artist_id": artist}
    S.post(f"{URL}/items/artist_gallery", json=item).raise_for_status()
    print(f"  ✓ {idx + 1:>3} {name}{'  → artista enlazado' if artist else ''}")


def from_instagram(profile, login_user, limit):
    import instaloader
    L = instaloader.Instaloader(download_videos=False, save_metadata=False, quiet=True)
    if login_user:
        try:
            L.load_session_from_file(login_user)
        except FileNotFoundError:
            L.interactive_login(login_user)  # pide contraseña / 2FA y guarda la sesión
            L.save_session_to_file()
    p = instaloader.Profile.from_username(L.context, profile)
    n = 0
    for post in p.get_posts():
        if n >= limit:
            break
        url = post.url  # en vídeos es la miniatura; en carruseles, la primera imagen
        if post.typename == "GraphSidecar":
            node = next(iter(post.get_sidecar_nodes()), None)
            url = node.display_url if node else url
        yield f"{post.shortcode}.jpg", requests.get(url, timeout=30).content, post.caption, f"https://www.instagram.com/p/{post.shortcode}/"
        n += 1
        time.sleep(2)  # sin prisas: Instagram limita


def from_folder(folder, limit):
    files = sorted([f for f in Path(folder).iterdir() if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".heic"}],
                   key=lambda f: f.stat().st_mtime, reverse=True)[:limit]
    for f in files:
        txt = f.with_suffix(".txt")  # pie de foto opcional (mismo nombre .txt)
        yield f.name, f.read_bytes(), txt.read_text("utf-8") if txt.exists() else None, f"file:{f.name}"


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="mode", required=True)
    a = sub.add_parser("instagram"); a.add_argument("profile"); a.add_argument("--login")
    b = sub.add_parser("folder"); b.add_argument("path")
    for p in (a, b):
        p.add_argument("--limit", type=int, default=40)
        p.add_argument("--featured", type=int, default=12, help="cuántas salen en la portada")
    args = ap.parse_args()

    login()
    folder, handles = folder_id(), artists_by_handle()
    src = from_instagram(args.profile, args.login, args.limit) if args.mode == "instagram" else from_folder(args.path, args.limit)
    print(f"Importando a {URL} …")
    idx = 0
    for name, raw, caption, source in src:
        if already_imported(source):
            print(f"  · ya estaba: {name}"); continue
        try:
            upload(raw, name, folder, idx, args.featured, caption, source, handles); idx += 1
        except Exception as e:  # una foto rota no para la importación
            print(f"  ✗ {name}: {e}")
    print(f"Hecho: {idx} fotos nuevas (demo). Revisa y valida en Directus > Galería / portfolio.")


if __name__ == "__main__":
    main()
