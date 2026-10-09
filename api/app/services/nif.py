"""Validación de NIF español (DNI, NIE y CIF/NIF de entidades). Solo comprueba el formato y el dígito de control."""
import re

LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE"


def normalizar(nif: str) -> str:
    return re.sub(r"[\s.\-]", "", nif or "").upper()


def valido(nif: str) -> bool:
    n = normalizar(nif)
    if re.fullmatch(r"\d{8}[A-Z]", n):                       # DNI
        return LETRAS[int(n[:8]) % 23] == n[8]
    if re.fullmatch(r"[XYZ]\d{7}[A-Z]", n):                  # NIE
        return LETRAS[int(str("XYZ".index(n[0])) + n[1:8]) % 23] == n[8]
    if re.fullmatch(r"[KLM]\d{7}[A-Z]", n):                  # NIF especiales de personas físicas
        return LETRAS[int(n[1:8]) % 23] == n[8]
    if re.fullmatch(r"[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]", n):  # entidades
        digitos = n[1:8]
        pares = sum(int(d) for d in digitos[1::2])
        impares = sum(sum(divmod(int(d) * 2, 10)) for d in digitos[0::2])
        control = (10 - (pares + impares) % 10) % 10
        letra = "JABCDEFGHI"[control]
        if n[0] in "PQRSW" or n[0] == "N":
            return n[8] == letra
        if n[0] in "ABEH":
            return n[8] == str(control)
        return n[8] in (str(control), letra)
    return False
