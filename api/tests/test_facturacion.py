"""Facturación: IVA, descuentos, numeración, rectificativas, anulación y cadena VERI*FACTU."""
import hashlib
from datetime import date

from app.services import nif
from app.services.fiscal import desglosar, desglose_por_tipo
from app.services.verifactu import huella_alta, importe

EMISOR = {"nif": "B12345674", "razon_social": "Mamanoquiere Tattoo S.L.", "domicilio": "Carrer de Carles III, 21",
          "codigo_postal": "07800"}


def login(client, email, pw):
    r = client.post("/auth/login", data={"username": email, "password": pw})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_calculos():
    assert desglosar(12100, 2100) == (10000, 2100)
    assert desglosar(5000, 2100) == (4132, 868)
    assert desglosar(10000, 2100, con_iva=False) == (10000, 2100)
    # se agrupa por tipo antes de redondear
    assert desglose_por_tipo([(5000, 2100), (5000, 2100)]) == [{"iva_x100": 2100, "base_cent": 8264, "cuota_cent": 1736}]
    assert importe(12345) == "123.45" and importe(-5) == "-0.05" and importe(0) == "0.00"


def test_nif():
    assert nif.valido("12345678Z") and not nif.valido("12345678A")
    assert nif.valido("X1234567L") and nif.valido("B12345674") and not nif.valido("B12345670")


def test_huella_ejemplo_aeat():
    # Ejemplo publicado por la AEAT para el primer registro de una cadena
    h = huella_alta("89890001K", "12345678/G33", date(2024, 1, 1), "F1", 1235, 12345, None, "2024-01-01T19:20:30+01:00")
    cadena = ("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024"
              "&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00")
    assert h == hashlib.sha256(cadena.encode()).hexdigest().upper()
    assert h == "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60"


def test_flujo_facturacion(client, admin):
    hoy = date.today().isoformat()
    # Tienda 2 para no chocar con el cierre de caja de otros tests
    t = {"tienda_id": 2, "forma_pago": "tarjeta"}

    # Sin datos fiscales no se factura
    tr = client.post("/trabajos", headers=admin, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 20000}).json()
    assert (tr["base_cent"], tr["cuota_iva_cent"], tr["iva_x100"]) == (16529, 3471, 2100)
    r = client.post("/facturas", headers=admin, json={"tipo": "F2", "tienda_id": 2, "trabajo_ids": [tr["id"]]})
    assert r.status_code == 422 and "datos fiscales" in r.json()["detail"]

    cfg = client.put("/facturacion/config", headers=admin, json={"emisor": EMISOR, "verifactu": {"modo": "pruebas"}})
    assert cfg.status_code == 200, cfg.text
    assert cfg.json()["verifactu"]["sistema"]["nombre_sistema"]  # fusiona con los valores por defecto

    # Descuentos
    pia = client.post("/usuarios", headers=admin, json={"nombre": "Pía", "email": "pia@test.com", "password": "pia12345",
                                                        "rol": "tatuador", "tienda_id": 2}).json()
    tp = login(client, "pia@test.com", "pia12345")
    amigos = client.post("/descuentos", headers=admin, json={"nombre": "Amigos", "tipo": "porcentaje", "valor": 10}).json()
    vip = client.post("/descuentos", headers=admin, json={"nombre": "VIP", "tipo": "porcentaje", "valor": 30,
                                                          "solo_gestion": True}).json()
    assert {d["nombre"] for d in client.get("/descuentos", headers=tp).json()} == {"Amigos", "VIP"}
    t2 = client.post("/trabajos", headers=tp, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 15000,
                                                     "descuento_id": amigos["id"]}).json()
    assert (t2["precio_cent"], t2["descuento_cent"], t2["importe_cent"]) == (15000, 1500, 13500)
    assert t2["profesional_cent"] == 9450 and t2["descuento_motivo"] == "Amigos"
    assert client.post("/trabajos", headers=tp, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 15000,
                                                       "descuento_id": vip["id"]}).status_code == 403
    assert client.post("/trabajos", headers=tp, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 15000,
                                                       "descuento_pct": 40, "descuento_motivo": "x"}).status_code == 403
    assert client.post("/trabajos", headers=tp, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 15000,
                                                       "descuento_cent": 1000}).status_code == 422  # sin motivo

    # Ticket (F2) con dos trabajos
    f1 = client.post("/facturas", headers=admin, json={"tipo": "F2", "tienda_id": 2, "trabajo_ids": [tr["id"], t2["id"]]})
    assert f1.status_code == 200, f1.text
    f1 = f1.json()
    yy = hoy[2:4]
    assert f1["num_serie"] == f"TB{yy}-00001"
    assert f1["total_cent"] == 33500 and f1["base_cent"] + f1["cuota_cent"] == 33500
    assert f1["desglose"] == [{"iva_x100": 2100, "base_cent": 27686, "cuota_cent": 5814}]
    assert f1["verifactu"]["qr"].startswith("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345674")
    assert f1["verifactu"]["registros"][0]["estado_envio"] == "pendiente"
    # No se puede facturar dos veces ni anular un trabajo facturado
    assert client.post("/facturas", headers=admin, json={"tipo": "F2", "tienda_id": 2, "trabajo_ids": [tr["id"]]}).status_code == 409
    assert client.delete(f"/trabajos/{tr['id']}", headers=admin).status_code == 409
    # NIF bloqueado tras emitir
    assert client.put("/facturacion/config", headers=admin, json={"emisor": {**EMISOR, "nif": "A58818501"}}).status_code == 409

    # F2 por encima de 400 € → no
    big = client.post("/trabajos", headers=admin, json={**t, "tipo_servicio": "tatuaje", "precio_cent": 60000}).json()
    assert client.post("/facturas", headers=admin, json={"tipo": "F2", "tienda_id": 2, "trabajo_ids": [big["id"]]}).status_code == 422
    # F1 exige NIF válido y domicilio
    dest = {"nombre": "Laura Ruiz", "nif": "12345678A", "domicilio": "C/ Mayor 1", "codigo_postal": "07800", "localidad": "Eivissa"}
    assert client.post("/facturas", headers=admin, json={"tipo": "F1", "tienda_id": 2, "trabajo_ids": [big["id"]],
                                                         "destinatario": dest}).status_code == 422
    f2 = client.post("/facturas", headers=admin, json={"tipo": "F1", "tienda_id": 2, "trabajo_ids": [big["id"]],
                                                       "destinatario": {**dest, "nif": "12345678Z"}}).json()
    assert f2["num_serie"] == f"FB{yy}-00001" and f2["destinatario"]["nif"] == "12345678Z"
    # Extranjero con pasaporte
    f3 = client.post("/facturas", headers=admin, json={"tipo": "F1", "tienda_id": 2, "lineas": [
        {"descripcion": "Crema cicatrizante", "precio_cent": 1500, "tipo_servicio": "producto"}],
        "destinatario": {"nombre": "Anna K.", "nif": "PA1234567", "pais": "GB", "domicilio": "1 High St, London"}})
    assert f3.status_code == 200, f3.text
    assert f3.json()["num_serie"] == f"FB{yy}-00002"

    # Rectificativa total de la F1 (devolución)
    r1 = client.post(f"/facturas/{f2['id']}/rectificar", headers=admin, json={"motivo": "Devolución"}).json()
    assert r1["tipo"] == "R4" and r1["total_cent"] == -60000 and r1["num_serie"] == f"RB{yy}-00001"
    assert client.get(f"/facturas/{f2['id']}", headers=admin).json()["estado"] == "rectificada"
    assert client.post(f"/facturas/{f2['id']}/anular", headers=admin, json={"motivo": "x" * 5}).status_code == 409
    # Rectificativa de ticket = R5
    r5 = client.post(f"/facturas/{f1['id']}/rectificar", headers=admin, json={"motivo": "Precio mal", "total": False,
                     "lineas": [{"descripcion": "Ajuste", "precio_cent": -1000, "tipo_servicio": "tatuaje"}]}).json()
    assert r5["tipo"] == "R5" and r5["total_cent"] == -1000

    # Anulación libera los trabajos
    tx = client.post("/trabajos", headers=admin, json={**t, "tipo_servicio": "piercing", "precio_cent": 4000}).json()
    fx = client.post("/facturas", headers=admin, json={"tipo": "F2", "tienda_id": 2, "trabajo_ids": [tx["id"]]}).json()
    an = client.post(f"/facturas/{fx['id']}/anular", headers=admin, json={"motivo": "Duplicada"}).json()
    assert an["estado"] == "anulada" and [r["tipo"] for r in an["verifactu"]["registros"]] == ["alta", "anulacion"]
    assert client.get("/trabajos", headers=admin, params={"sin_factura": True, "tienda_id": 2}).json()[0]["id"] == tx["id"]

    # Cadena íntegra
    est = client.get("/verifactu/estado", headers=admin).json()
    assert est["cadena"]["ok"] and est["cadena"]["registros"] == 7
    assert est["registros"]["pendiente"] == 7
    assert client.post("/verifactu/enviar", headers=admin).json()["enviados"] == 0  # sin certificado

    # PDF y XML
    pdf = client.get(f"/facturas/{f2['id']}/pdf", headers=admin)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    x = client.get(f"/facturas/{r1['id']}/xml", headers=admin).text
    assert "<sum1:TipoFactura>R4</sum1:TipoFactura>" in x and "<sum1:ImporteTotal>-600.00</sum1:ImporteTotal>" in x
    assert "<sum1:RegistroAnterior>" in x and "<sum1:IDFacturaRectificada>" in x
    x3 = client.get(f"/facturas/{f3.json()['id']}/xml", headers=admin).text
    assert "<sum1:IDOtro><sum1:CodigoPais>GB</sum1:CodigoPais>" in x3

    # Resumen de IVA y libro
    iva = client.get("/facturacion/iva", headers=admin, params={"desde": hoy, "hasta": hoy, "tienda_id": 2}).json()
    assert iva["total_cent"] == 33500 + 60000 + 1500 - 60000 - 1000
    assert iva["base_cent"] + iva["cuota_cent"] == iva["total_cent"]
    assert iva["sin_factura"]["trabajos"] == 1
    libro = client.get("/facturacion/libro.csv", headers=admin, params={"desde": hoy, "hasta": hoy})
    assert f"FB{yy}-00001" in libro.text and "Anna K." in libro.text

    # Caja con desglose de IVA
    caja = client.get("/caja/resumen", headers=admin, params={"tienda_id": 2, "fecha": hoy}).json()
    assert caja["base_cent"] + caja["cuota_iva_cent"] == caja["facturado_cent"]
    assert caja["descuentos_cent"] == 1500

    # Permisos: un tatuador no ve facturas
    assert client.get("/facturas", headers=tp).status_code == 403


def test_comision_sobre_base(client, admin):
    client.put("/facturacion/config", headers=admin, json={"comision_sobre": "base"})
    r = client.get("/comisiones/simular", headers=admin, params={"usuario_id": 1, "tipo_servicio": "tatuaje",
                                                                 "importe_cent": 12100}).json()
    assert r["base_cent"] == 10000 and r["profesional_cent"] == 7000 and r["estudio_cent"] == 5100
    client.put("/facturacion/config", headers=admin, json={"comision_sobre": "total"})
