import io

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")
BASE = {"nombre": "Anna K.", "telefono": "+44 7700 900000", "servicio": "tattoo", "acepta_privacidad": "true",
        "ubicacion": "puerto", "zona_corporal": "antebrazo", "tamano": "10 cm", "mensaje": "Línea fina",
        "pagina_origen": "/en/tattoo", "idioma": "en"}


def test_ubicaciones_seo(client):
    u = client.get("/publico/ubicaciones").json()
    assert [x["slug"] for x in u] == ["puerto", "beach"]
    assert u[0]["schema_org"]["@type"] == "TattooParlor"
    assert u[0]["whatsapp_url"] == "https://wa.me/34672912034"
    assert "google.com/maps" in u[0]["google_maps"]


def test_lead_web_y_crm(client, admin):
    r = client.post("/publico/leads", data=BASE,
                    files=[("adjuntos", ("ref.png", io.BytesIO(PNG), "image/png"))])
    assert r.status_code == 201, r.text
    lid = r.json()["id"]

    # honeypot: responde ok pero no guarda
    assert client.post("/publico/leads", data={**BASE, "website": "spam.com"}).json() == {"ok": True}
    # sin privacidad, servicio raro, archivo no imagen
    assert client.post("/publico/leads", data={**BASE, "acepta_privacidad": "false"}).status_code == 422
    assert client.post("/publico/leads", data={**BASE, "servicio": "barberia"}).status_code == 422
    assert client.post("/publico/leads", data=BASE, files=[("adjuntos", ("x.pdf", io.BytesIO(b"%PDF"),
                       "application/pdf"))]).status_code == 415

    bandeja = client.get("/leads", headers=admin, params={"abiertos": True}).json()
    assert len(bandeja) == 1  # el honeypot no entró
    lead = bandeja[0]
    assert lead["estado"] == "nuevo" and set(lead["etiquetas"]) == {"web", "tattoo", "puerto"}
    assert client.get(f"/leads/{lid}/adjuntos/{lead['adjuntos'][0]}", headers=admin).status_code == 200

    r = client.patch(f"/leads/{lid}", headers=admin, json={"estado": "presupuesto_enviado"}).json()
    assert r["historial"][0]["a"] == "presupuesto_enviado"
    c = client.post(f"/leads/{lid}/convertir", headers=admin).json()
    assert c["telefono"] == "+44 7700 900000"
    assert client.post(f"/leads/{lid}/convertir", headers=admin).json()["id"] == c["id"]  # idempotente

    # analítica
    assert client.post("/publico/eventos", json={"tipo": "clic_whatsapp", "tienda": "beach"}).status_code == 204
    assert client.post("/publico/eventos", json={"tipo": "lo_que_sea"}).status_code == 422
    res = client.get("/leads/resumen", headers=admin).json()
    assert res["leads"]["presupuesto_enviado"] == 1 and res["eventos_web"]["clic_whatsapp"] == 1
