import logging
import smtplib
from email.message import EmailMessage

import httpx

from ..config import settings

log = logging.getLogger("mensajeria")


def personalizar(texto: str, nombre: str) -> str:
    return texto.replace("{nombre}", nombre.split(" ")[0])


def enviar_email(destino: str, asunto: str, cuerpo: str) -> bool:
    if not settings.smtp_host:
        log.info("SMTP no configurado; simulado envío a %s", destino)
        return True
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, destino, asunto
    msg.set_content(cuerpo)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("Email a %s falló: %s", destino, e)
        return False


def enviar_whatsapp(telefono: str, texto: str) -> bool:
    if not settings.evolution_url:
        log.info("Evolution API no configurada; simulado envío a %s", telefono)
        return True
    numero = "".join(ch for ch in telefono if ch.isdigit())
    if len(numero) == 9:
        numero = "34" + numero
    try:
        r = httpx.post(
            f"{settings.evolution_url.rstrip('/')}/message/sendText/{settings.evolution_instance}",
            headers={"apikey": settings.evolution_api_key},
            json={"number": numero, "text": texto},
            timeout=20,
        )
        return r.status_code < 300
    except Exception as e:  # noqa: BLE001
        log.warning("WhatsApp a %s falló: %s", numero, e)
        return False
