from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import EstadoCita, EstadoLead, FormaPago, Rol, TipoServicio


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Ajustes
class AjustesOut(ORM):
    nombre_estudio: str
    logo_url: str | None
    tema: dict
    modulos: dict
    preguntas_consentimiento: list
    texto_legal: str
    moneda: str
    web: dict


class AjustesIn(BaseModel):
    nombre_estudio: str | None = None
    logo_url: str | None = None
    tema: dict | None = None
    modulos: dict | None = None
    preguntas_consentimiento: list | None = None
    texto_legal: str | None = None
    web: dict | None = None


# Tiendas y usuarios
class TiendaIn(BaseModel):
    nombre: str
    slug: str | None = None
    direccion: str | None = None
    codigo_postal: str | None = None
    localidad: str | None = None
    telefono: str | None = None
    whatsapp: str | None = None
    horario: list = []
    lat: float | None = None
    lng: float | None = None
    servicios: list = []
    activa: bool = True


class TiendaOut(ORM, TiendaIn):
    id: int


class UsuarioIn(BaseModel):
    nombre: str
    email: str
    password: str = Field(min_length=8)
    rol: Rol
    tienda_id: int | None = None
    color: str | None = None
    bio: str | None = None


class UsuarioUpd(BaseModel):
    nombre: str | None = None
    rol: Rol | None = None
    tienda_id: int | None = None
    color: str | None = None
    bio: str | None = None
    activo: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class UsuarioOut(ORM):
    id: int
    nombre: str
    email: str
    rol: Rol
    tienda_id: int | None
    color: str | None
    activo: bool
    bio: str | None


# Comisiones
class ReglaIn(BaseModel):
    tipo_servicio: TipoServicio
    porcentaje: int = Field(ge=0, le=100)
    rol: Rol | None = None
    usuario_id: int | None = None
    tienda_id: int | None = None


class ReglaOut(ORM, ReglaIn):
    id: int


# Clientes
class ClienteIn(BaseModel):
    nombre: str
    email: str | None = None
    telefono: str | None = None
    fecha_nacimiento: date | None = None
    documento: str | None = None
    acepta_comunicaciones: bool = False
    notas: str | None = None


class ClienteOut(ORM, ClienteIn):
    id: int
    creado: datetime


# Citas
class CitaIn(BaseModel):
    tienda_id: int
    usuario_id: int
    cliente_id: int
    inicio: datetime
    fin: datetime
    descripcion: str | None = None
    estado: EstadoCita = EstadoCita.reservada
    senal_cent: int = 0


class CitaUpd(BaseModel):
    inicio: datetime | None = None
    fin: datetime | None = None
    usuario_id: int | None = None
    descripcion: str | None = None
    estado: EstadoCita | None = None
    senal_cent: int | None = None


class CitaOut(ORM, CitaIn):
    id: int
    cliente_nombre: str = ""


# Trabajos
class TrabajoIn(BaseModel):
    tienda_id: int
    usuario_id: int | None = None  # por defecto, quien lo registra
    cliente_id: int | None = None
    cita_id: int | None = None
    fecha: date | None = None
    tipo_servicio: TipoServicio
    descripcion: str | None = None
    importe_cent: int | None = Field(default=None, gt=0)  # compatibilidad: precio sin descuento
    precio_cent: int | None = Field(default=None, gt=0)   # precio de tarifa (IVA incluido si así está configurado)
    descuento_id: int | None = None                       # descuento predefinido
    descuento_pct: int | None = Field(default=None, ge=0, le=100)
    descuento_cent: int | None = Field(default=None, ge=0)
    descuento_motivo: str | None = Field(default=None, max_length=120)
    forma_pago: FormaPago
    en_portfolio: bool = False


class TrabajoOut(ORM):
    id: int
    tienda_id: int
    usuario_id: int
    cliente_id: int | None
    cita_id: int | None
    fecha: date
    tipo_servicio: TipoServicio
    descripcion: str | None
    importe_cent: int
    forma_pago: FormaPago
    porcentaje: int
    profesional_cent: int
    estudio_cent: int
    foto_url: str | None
    en_portfolio: bool
    usuario_nombre: str = ""
    precio_cent: int | None = None
    descuento_cent: int = 0
    descuento_id: int | None = None
    descuento_motivo: str | None = None
    iva_x100: int | None = None
    base_cent: int | None = None
    cuota_iva_cent: int | None = None
    factura_id: int | None = None


class RepartoPreview(BaseModel):
    porcentaje: int
    profesional_cent: int
    estudio_cent: int
    iva_x100: int | None = None
    base_cent: int | None = None
    cuota_iva_cent: int | None = None
    total_cent: int | None = None


# Consentimiento
class ConsentimientoIn(BaseModel):
    cliente_id: int
    trabajo_id: int | None = None
    respuestas: dict
    firma_png: str  # data URL o base64
    acepta_privacidad: bool


class ConsentimientoOut(ORM):
    id: int
    cliente_id: int
    trabajo_id: int | None
    respuestas: dict
    pdf_path: str | None
    creado: datetime


# Mensajes
class MensajeIn(BaseModel):
    canal: str = Field(pattern="^(email|whatsapp)$")
    asunto: str | None = None
    cuerpo: str
    cliente_ids: list[int] | None = None  # None = todos los que aceptan comunicaciones


class MensajeOut(ORM):
    id: int
    canal: str
    asunto: str | None
    cuerpo: str
    destinatarios: int
    enviados: int
    fallidos: int
    creado: datetime


# Leads (CRM web)
class LeadOut(ORM):
    id: int
    nombre: str
    telefono: str
    email: str | None
    origen: str
    pagina_origen: str | None
    idioma: str
    tienda_id: int | None
    servicio: str
    zona_corporal: str | None
    tamano: str | None
    fecha_preferida: date | None
    mensaje: str | None
    adjuntos: list
    estado: EstadoLead
    etiquetas: list
    acepta_privacidad: bool
    acepta_comunicaciones: bool
    asignado_a: int | None
    cliente_id: int | None
    notas: str | None
    historial: list
    creado: datetime
    actualizado: datetime


class LeadUpd(BaseModel):
    estado: EstadoLead | None = None
    asignado_a: int | None = None
    notas: str | None = None
    etiquetas: list[str] | None = None
    tienda_id: int | None = None


class EventoIn(BaseModel):
    tipo: str
    pagina: str | None = Field(default=None, max_length=300)
    tienda: str | None = Field(default=None, max_length=60)
    servicio: str | None = Field(default=None, max_length=30)
    idioma: str | None = Field(default=None, max_length=5)


# Facturación
class DescuentoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    tipo: str = Field(pattern="^(porcentaje|importe)$")
    valor: int = Field(gt=0)
    solo_gestion: bool = False
    activo: bool = True
    desde: date | None = None
    hasta: date | None = None


class DescuentoOut(ORM, DescuentoIn):
    id: int


class Destinatario(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    nif: str | None = Field(default=None, max_length=20)
    domicilio: str | None = Field(default=None, max_length=250)
    codigo_postal: str | None = Field(default=None, max_length=10)
    localidad: str | None = Field(default=None, max_length=80)
    pais: str | None = Field(default="ES", max_length=2)


class LineaLibre(BaseModel):
    descripcion: str = Field(min_length=1, max_length=250)
    cantidad: int = Field(default=1, ge=1, le=999)
    precio_cent: int  # unitario; negativo permitido solo en rectificativas
    descuento_cent: int = Field(default=0, ge=0)
    tipo_servicio: TipoServicio | None = None
    iva_x100: int | None = Field(default=None, ge=0, le=2100)


class FacturaIn(BaseModel):
    tipo: str = Field(default="F2", pattern="^F[12]$")
    tienda_id: int
    trabajo_ids: list[int] = []
    lineas: list[LineaLibre] = []
    cliente_id: int | None = None
    destinatario: Destinatario | None = None
    forma_pago: FormaPago | None = None
    descripcion: str | None = Field(default=None, max_length=500)
    fecha_operacion: date | None = None


class RectificarIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=250)
    tipo: str = Field(default="", pattern="^(R[1-5])?$")  # vacío: R4 si es completa, R5 si es simplificada
    total: bool = True              # True: devuelve/anula el importe completo de la original
    lineas: list[LineaLibre] = []   # si total=False, las diferencias (negativas para devoluciones)
    destinatario: Destinatario | None = None  # para pasar de simplificada a completa (R5 → con NIF)


class AnularIn(BaseModel):
    motivo: str = Field(min_length=3, max_length=250)


class FacturaLineaOut(ORM):
    id: int
    trabajo_id: int | None
    descripcion: str
    cantidad: int
    precio_cent: int
    descuento_cent: int
    iva_x100: int
    base_cent: int
    cuota_cent: int
    total_cent: int


class FacturaOut(ORM):
    id: int
    tienda_id: int
    tipo: str
    serie: str
    numero: int
    num_serie: str
    fecha_expedicion: date
    fecha_operacion: date | None
    emisor: dict
    destinatario: dict | None
    cliente_id: int | None
    descripcion: str
    desglose: list
    base_cent: int
    cuota_cent: int
    total_cent: int
    forma_pago: str | None
    rectificada_id: int | None
    tipo_rectificacion: str | None
    motivo: str | None
    estado: str
    creado: datetime
    lineas: list[FacturaLineaOut] = []
    verifactu: dict | None = None


class RegistroOut(ORM):
    id: int
    tipo: str
    factura_id: int
    num_serie: str
    fecha_expedicion: date
    huella: str
    huella_anterior: str | None
    fecha_hora_gen: str
    estado_envio: str
    csv_aeat: str | None
    intentos: int
    enviado: datetime | None
    creado: datetime
