# Dirección del dossier: editorial, oscuro, un único acento editable
TEMA = {
    "acento": "#D52B1E",      # rojo intenso; alternativas: coral #E0573A, azul eléctrico #2F5BFF
    "carbon": "#0E0E0F",
    "grafito": "#2A2A2D",
    "blanco_roto": "#F2EFEA",
    "piel": "#D9C2A7",
    "modo": "oscuro",         # oscuro | claro
    "densidad": "normal",     # compacta | normal | amplia
    "fuente_titulos": "Bricolage Grotesque",
    "fuente_texto": "DM Sans",
    "radio": 4,
}
WEB = {
    "idiomas": ["es", "en"],          # preparado para it, fr, de
    "instagram": "https://www.instagram.com/mamanoquiere_tattoo.ibiza",
    "valoracion": None,               # {"media": 4.9, "total": 246, "fuente": "Google"} solo si está verificada
    "seo": {
        "es": {"titulo": "Mamanoquiere Tattoo Ibiza | Tatuajes y piercing en Eivissa",
               "descripcion": "Estudio de tatuajes y piercing en Ibiza: Puerto y Beach. Reserva por WhatsApp o teléfono."},
        "en": {"titulo": "Mamanoquiere Tattoo Ibiza | Tattoo & piercing studio",
               "descripcion": "Tattoo and piercing studio in Ibiza, near the port and the beach. Book by WhatsApp or phone."},
    },
}
SERVICIOS_WEB = ["tattoo", "piercing_corporal", "piercing_oreja", "piercing_nariz"]
EVENTOS_WEB = {"clic_telefono", "clic_whatsapp", "clic_instagram", "clic_como_llegar", "envio_formulario",
               "inicio_formulario", "abandono_formulario", "seleccion_ubicacion", "seleccion_servicio",
               "clic_portfolio"}
MODULOS = {
    "web_leads": True,
    "agenda": True, "trabajos": True, "caja": True, "clientes": True,
    "consentimiento": True, "mensajes": True, "portfolio": True,
    "piercing": True, "productos": True, "invitados": True, "facturacion": True,
}
PREGUNTAS = [
    {"id": "alergias", "texto": "Alergias (látex, metales, tintas)", "tipo": "si_no", "detalle": True},
    {"id": "diabetes", "texto": "Diabetes", "tipo": "si_no"},
    {"id": "coagulacion", "texto": "Problemas de coagulación o anticoagulantes", "tipo": "si_no"},
    {"id": "embarazo", "texto": "Embarazo o lactancia", "tipo": "si_no"},
    {"id": "piel", "texto": "Enfermedades de la piel en la zona", "tipo": "si_no", "detalle": True},
]
# Porcentajes para el profesional (lo que cobra el estudio es el resto)
REGLAS = [
    {"tipo_servicio": "tatuaje", "porcentaje": 70},
    {"tipo_servicio": "tatuaje", "porcentaje": 60, "rol": "invitado"},
    {"tipo_servicio": "piercing", "porcentaje": 50},
    {"tipo_servicio": "producto", "porcentaje": 10},
]

# Datos públicos encontrados (Fresha/Cybo). PENDIENTE DE VALIDAR CON EL ESTUDIO.
TIENDAS = [
    {"nombre": "Mamanoquiere Tattoo Puerto", "slug": "puerto", "direccion": "Carrer de Carles III, 21",
     "codigo_postal": "07800", "localidad": "Eivissa", "telefono": "+34 672 91 20 34", "whatsapp": "+34672912034",
     "horario": [{"dias": "Mo-Su", "abre": "11:00", "cierra": "21:00"}],
     "servicios": ["tattoo", "piercing_corporal"]},
    {"nombre": "Mamanoquiere Tattoo Beach", "slug": "beach", "direccion": "Carrer del País Basc, 13",
     "codigo_postal": "07800", "localidad": "Eivissa", "telefono": "+34 672 91 20 34", "whatsapp": "+34672912034",
     "horario": [{"dias": "Mo-Su", "abre": "11:00", "cierra": "01:00"}],
     "servicios": ["tattoo", "piercing_corporal", "piercing_oreja", "piercing_nariz"]},
]

# Facturación. Los datos fiscales están VACÍOS a propósito: hay que rellenarlos con los del estudio.
FACTURACION = {
    "emisor": {"nif": "", "razon_social": "", "domicilio": "", "codigo_postal": "", "localidad": "Eivissa",
               "provincia": "Illes Balears"},
    # IVA por tipo de servicio en centésimas (2100 = 21 %). PENDIENTE DE VALIDAR con la asesoría.
    "iva": {"tatuaje": 2100, "piercing": 2100, "producto": 2100},
    "precios_con_iva": True,          # el precio que se cobra al cliente ya lleva IVA
    "comision_sobre": "total",        # total (IVA incluido, como hasta ahora) | base (sin IVA)
    "limite_simplificada_cent": 40000,  # 400 € IVA incl.: por encima, factura completa con NIF del cliente
    "descuento_max_pct": 15,          # tope de descuento manual para quien no es gestión
    "series": {"F1": "F", "F2": "T", "R": "R"},  # + prefijo de tienda + año: T P 26 → TP26-00001
    "prefijo_tienda": {},             # {"1": "P", "2": "B"}; si falta, inicial del slug
    "texto_pie": "",
    "verifactu": {
        "modo": "preparado",          # desactivado | preparado (registra y encadena, no envía) | pruebas | produccion
        "envio_automatico": False,
        "certificado_pfx": "",        # ruta dentro del contenedor (volumen), nunca en el repo
        "certificado_password_env": "VERIFACTU_CERT_PASSWORD",
        "sistema": {                  # SistemaInformatico (datos del productor del software)
            "nombre_razon": "", "nif": "", "nombre_sistema": "Mamanoquiere Gestión", "id_sistema": "MQ",
            "version": "1.0", "numero_instalacion": "1",
        },
    },
}
