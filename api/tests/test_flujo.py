import base64
import io
from datetime import date


# PNG 1x1 transparente
FIRMA = "data:image/png;base64," + base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()
HOY = date.today().isoformat()


def login(client, email, pw):
    r = client.post("/auth/login", data={"username": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_ajustes_personalizables(client, admin):
    assert client.get("/ajustes").json()["tema"]["acento"] == "#D52B1E"
    r = client.put("/ajustes", headers=admin, json={"tema": {"acento": "#2F5BFF"}})
    assert r.status_code == 200
    a = r.json()
    assert a["tema"]["acento"] == "#2F5BFF" and a["tema"]["modo"] == "oscuro"  # fusiona, no pisa
    assert client.get("/publico/web").json()["web"]["idiomas"] == ["es", "en"]


def test_flujo_completo(client, admin):
    nerea = client.post("/usuarios", headers=admin, json={
        "nombre": "Nerea", "email": "nerea@test.com", "password": "nerea1234", "rol": "tatuador", "tienda_id": 1}).json()
    kenji = client.post("/usuarios", headers=admin, json={
        "nombre": "Kenji", "email": "kenji@test.com", "password": "kenji1234", "rol": "invitado", "tienda_id": 1}).json()
    lucia = client.post("/usuarios", headers=admin, json={
        "nombre": "Lucía", "email": "lucia@test.com", "password": "lucia1234", "rol": "piercer", "tienda_id": 1}).json()
    tn = login(client, "nerea@test.com", "nerea1234")

    # Regla específica para Nerea: 75%
    client.post("/comisiones/reglas", headers=admin, json={"tipo_servicio": "tatuaje", "porcentaje": 75,
                                                            "usuario_id": nerea["id"]})
    sim = client.get("/comisiones/simular", headers=tn, params={
        "usuario_id": kenji["id"], "tipo_servicio": "tatuaje", "importe_cent": 50000}).json()
    assert sim == {"porcentaje": 60, "profesional_cent": 30000, "estudio_cent": 20000}

    cli = client.post("/clientes", headers=tn, json={"nombre": "Sergio M.", "email": "s@x.com",
                                                    "telefono": "600000000", "acepta_comunicaciones": True}).json()

    # Cita + solape
    cita = {"tienda_id": 1, "usuario_id": nerea["id"], "cliente_id": cli["id"],
            "inicio": f"{HOY}T12:30:00", "fin": f"{HOY}T15:30:00"}
    assert client.post("/citas", headers=tn, json=cita).status_code == 200
    assert client.post("/citas", headers=tn, json={**cita, "inicio": f"{HOY}T14:00:00",
                                                   "fin": f"{HOY}T16:00:00"}).status_code == 409
    # Nerea no puede crear citas a otros
    assert client.post("/citas", headers=tn, json={**cita, "usuario_id": kenji["id"]}).status_code == 403

    # Trabajos
    t = client.post("/trabajos", headers=tn, json={"tienda_id": 1, "cliente_id": cli["id"], "tipo_servicio": "tatuaje",
                                                  "importe_cent": 30000, "forma_pago": "tarjeta"}).json()
    assert (t["porcentaje"], t["profesional_cent"], t["estudio_cent"]) == (75, 22500, 7500)
    client.post("/trabajos", headers=admin, json={"tienda_id": 1, "usuario_id": lucia["id"],
                "tipo_servicio": "piercing", "importe_cent": 4000, "forma_pago": "efectivo"})
    client.post("/trabajos", headers=admin, json={"tienda_id": 1, "usuario_id": lucia["id"],
                "tipo_servicio": "producto", "importe_cent": 2050, "forma_pago": "efectivo"})

    # Foto + portfolio
    png = base64.b64decode(FIRMA.split(",")[1])
    r = client.post(f"/trabajos/{t['id']}/foto", headers=tn, files={"foto": ("a.png", io.BytesIO(png), "image/png")})
    assert r.status_code == 200 and r.json()["foto_url"].startswith("/media/trabajos/")
    assert client.patch(f"/trabajos/{t['id']}/portfolio", headers=tn, params={"publicar": True}).status_code == 200
    assert len(client.get("/publico/portfolio").json()["trabajos"]) == 1

    # Caja: el profesional solo ve lo suyo
    r = client.get("/caja/resumen", headers=tn, params={"tienda_id": 1, "fecha": HOY}).json()
    assert len(r["personas"]) == 1 and "estudio_cent" not in r
    r = client.get("/caja/resumen", headers=admin, params={"tienda_id": 1, "fecha": HOY}).json()
    assert r["facturado_cent"] == 36050
    assert r["profesionales_cent"] + r["estudio_cent"] == 36050
    assert r["por_forma_pago"] == {"tarjeta": 30000, "efectivo": 6050}
    lucia_linea = next(p for p in r["personas"] if p["usuario_id"] == lucia["id"])
    assert lucia_linea["profesional_cent"] == 2000 + 205

    # Cierre bloquea nuevos trabajos
    assert client.post("/caja/cierres", headers=tn, params={"tienda_id": 1, "fecha": HOY}).status_code == 403
    assert client.post("/caja/cierres", headers=admin, params={"tienda_id": 1, "fecha": HOY}).status_code == 200
    assert client.post("/trabajos", headers=tn, json={"tienda_id": 1, "tipo_servicio": "tatuaje",
                       "importe_cent": 100, "forma_pago": "efectivo"}).status_code == 409
    csv = client.get("/caja/export.csv", headers=admin, params={"tienda_id": 1, "desde": HOY, "hasta": HOY})
    assert csv.status_code == 200 and "Nerea" in csv.text

    # Consentimiento
    resp = {p["id"]: False for p in client.get("/consentimientos/formulario", headers=tn).json()["preguntas"]}
    assert client.post("/consentimientos", headers=tn, json={"cliente_id": cli["id"], "respuestas": {},
                       "firma_png": FIRMA, "acepta_privacidad": True}).status_code == 422
    c = client.post("/consentimientos", headers=tn, json={"cliente_id": cli["id"], "respuestas": resp,
                    "firma_png": FIRMA, "acepta_privacidad": True})
    assert c.status_code == 200, c.text
    pdf = client.get(f"/consentimientos/{c.json()['id']}/pdf", headers=tn)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    # Mensajes
    prev = client.post("/mensajes/previsualizar", headers=admin, json={
        "canal": "whatsapp", "cuerpo": "Hola {nombre}, 10% en octubre"}).json()
    assert prev == {"destinatarios": 1, "ejemplo": "Hola Sergio, 10% en octubre"}
    m = client.post("/mensajes", headers=admin, json={"canal": "whatsapp", "cuerpo": "Hola {nombre}"})
    assert m.status_code == 200
    assert client.get("/mensajes", headers=admin).json()[0]["enviados"] == 1

    hist = client.get(f"/clientes/{cli['id']}/historial", headers=tn).json()
    assert len(hist["trabajos"]) == 1 and len(hist["consentimientos"]) == 1
