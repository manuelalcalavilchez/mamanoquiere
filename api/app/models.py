"""Modelo de datos. Los importes se guardan en céntimos (enteros)."""
import enum
from datetime import UTC, date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Rol(str, enum.Enum):
    admin = "admin"
    encargado = "encargado"
    tatuador = "tatuador"
    piercer = "piercer"
    invitado = "invitado"


class TipoServicio(str, enum.Enum):
    tatuaje = "tatuaje"
    piercing = "piercing"
    producto = "producto"


class FormaPago(str, enum.Enum):
    efectivo = "efectivo"
    tarjeta = "tarjeta"
    bizum = "bizum"
    transferencia = "transferencia"


class EstadoCita(str, enum.Enum):
    reservada = "reservada"
    confirmada = "confirmada"
    hecha = "hecha"
    no_presentado = "no_presentado"
    cancelada = "cancelada"


def ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Ajustes(Base):
    """Configuración del estudio (una sola fila). Todo lo personalizable vive aquí."""
    __tablename__ = "ajustes"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre_estudio: Mapped[str] = mapped_column(String(120), default="Mi estudio")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    tema: Mapped[dict] = mapped_column(JSON, default=dict)          # colores, tipografía, modo oscuro, densidad
    modulos: Mapped[dict] = mapped_column(JSON, default=dict)       # módulos activos
    preguntas_consentimiento: Mapped[list] = mapped_column(JSON, default=list)
    texto_legal: Mapped[str] = mapped_column(Text, default="")
    moneda: Mapped[str] = mapped_column(String(3), default="EUR")
    web: Mapped[dict] = mapped_column(JSON, default=dict)  # idiomas, redes, valoración verificada, SEO
    facturacion: Mapped[dict | None] = mapped_column(JSON)  # datos fiscales, IVA, series, Verifactu (ver defaults.FACTURACION)


class Tienda(Base):
    """Local físico. Los datos públicos alimentan la web, el mapa y el SEO local (LocalBusiness)."""
    __tablename__ = "tiendas"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str | None] = mapped_column(String(60), unique=True)
    direccion: Mapped[str | None] = mapped_column(String(250))
    codigo_postal: Mapped[str | None] = mapped_column(String(10))
    localidad: Mapped[str | None] = mapped_column(String(80))
    telefono: Mapped[str | None] = mapped_column(String(30))
    whatsapp: Mapped[str | None] = mapped_column(String(30))
    horario: Mapped[list] = mapped_column(JSON, default=list)  # [{"dias":"Mo-Su","abre":"11:00","cierra":"21:00"}]
    lat: Mapped[float | None] = mapped_column()
    lng: Mapped[float | None] = mapped_column()
    servicios: Mapped[list] = mapped_column(JSON, default=list)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    rol: Mapped[Rol] = mapped_column(Enum(Rol))
    tienda_id: Mapped[int | None] = mapped_column(ForeignKey("tiendas.id"))
    color: Mapped[str | None] = mapped_column(String(9))  # color en la agenda
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    bio: Mapped[str | None] = mapped_column(Text)


class ReglaComision(Base):
    """Porcentaje para el profesional. Se elige la regla más específica:
    usuario+servicio > rol+servicio > servicio. Tienda opcional como filtro."""
    __tablename__ = "reglas_comision"
    id: Mapped[int] = mapped_column(primary_key=True)
    tipo_servicio: Mapped[TipoServicio] = mapped_column(Enum(TipoServicio))
    porcentaje: Mapped[int] = mapped_column(Integer)  # 0-100
    rol: Mapped[Rol | None] = mapped_column(Enum(Rol))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    tienda_id: Mapped[int | None] = mapped_column(ForeignKey("tiendas.id"))


class Cliente(Base):
    __tablename__ = "clientes"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(160))
    email: Mapped[str | None] = mapped_column(String(200))
    telefono: Mapped[str | None] = mapped_column(String(30))
    fecha_nacimiento: Mapped[date | None] = mapped_column(Date)
    documento: Mapped[str | None] = mapped_column(String(30))
    acepta_comunicaciones: Mapped[bool] = mapped_column(Boolean, default=False)
    notas: Mapped[str | None] = mapped_column(Text)
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Cita(Base):
    __tablename__ = "citas"
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"))
    inicio: Mapped[datetime] = mapped_column(DateTime)
    fin: Mapped[datetime] = mapped_column(DateTime)
    descripcion: Mapped[str | None] = mapped_column(String(250))
    estado: Mapped[EstadoCita] = mapped_column(Enum(EstadoCita), default=EstadoCita.reservada)
    senal_cent: Mapped[int] = mapped_column(Integer, default=0)
    cliente: Mapped[Cliente] = relationship(lazy="joined")

    @property
    def cliente_nombre(self) -> str:
        return self.cliente.nombre if self.cliente else ""


class Trabajo(Base):
    """Trabajo realizado. El reparto se calcula y se congela al registrarlo."""
    __tablename__ = "trabajos"
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))
    cita_id: Mapped[int | None] = mapped_column(ForeignKey("citas.id"))
    fecha: Mapped[date] = mapped_column(Date)
    tipo_servicio: Mapped[TipoServicio] = mapped_column(Enum(TipoServicio))
    descripcion: Mapped[str | None] = mapped_column(String(250))
    importe_cent: Mapped[int] = mapped_column(Integer)
    forma_pago: Mapped[FormaPago] = mapped_column(Enum(FormaPago))
    porcentaje: Mapped[int] = mapped_column(Integer)
    profesional_cent: Mapped[int] = mapped_column(Integer)
    estudio_cent: Mapped[int] = mapped_column(Integer)
    foto_url: Mapped[str | None] = mapped_column(String(500))
    en_portfolio: Mapped[bool] = mapped_column(Boolean, default=False)
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    # Fiscal. importe_cent = lo cobrado (IVA incluido, ya descontado). Precio y descuento quedan para la trazabilidad.
    precio_cent: Mapped[int | None] = mapped_column(Integer)
    descuento_cent: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    descuento_id: Mapped[int | None] = mapped_column(Integer)
    descuento_motivo: Mapped[str | None] = mapped_column(String(120))
    iva_x100: Mapped[int | None] = mapped_column(Integer)          # 2100 = 21 %
    base_cent: Mapped[int | None] = mapped_column(Integer)
    cuota_iva_cent: Mapped[int | None] = mapped_column(Integer)
    factura_id: Mapped[int | None] = mapped_column(Integer)
    usuario: Mapped[Usuario] = relationship(lazy="joined")

    @property
    def usuario_nombre(self) -> str:
        return self.usuario.nombre if self.usuario else ""


class CierreCaja(Base):
    __tablename__ = "cierres_caja"
    __table_args__ = (UniqueConstraint("tienda_id", "fecha"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    fecha: Mapped[date] = mapped_column(Date)
    resumen: Mapped[dict] = mapped_column(JSON)
    cerrado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Consentimiento(Base):
    __tablename__ = "consentimientos"
    id: Mapped[int] = mapped_column(primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("clientes.id"))
    trabajo_id: Mapped[int | None] = mapped_column(ForeignKey("trabajos.id"))
    respuestas: Mapped[dict] = mapped_column(JSON)
    firma_png: Mapped[str] = mapped_column(Text)  # base64
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class Mensaje(Base):
    __tablename__ = "mensajes"
    id: Mapped[int] = mapped_column(primary_key=True)
    canal: Mapped[str] = mapped_column(String(20))  # email | whatsapp
    asunto: Mapped[str | None] = mapped_column(String(200))
    cuerpo: Mapped[str] = mapped_column(Text)
    destinatarios: Mapped[int] = mapped_column(Integer, default=0)
    enviados: Mapped[int] = mapped_column(Integer, default=0)
    fallidos: Mapped[int] = mapped_column(Integer, default=0)
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)


class EstadoLead(str, enum.Enum):
    nuevo = "nuevo"
    contactado = "contactado"
    pendiente_de_respuesta = "pendiente_de_respuesta"
    presupuesto_enviado = "presupuesto_enviado"
    cita_propuesta = "cita_propuesta"
    cita_confirmada = "cita_confirmada"
    realizado = "realizado"
    cancelado = "cancelado"
    descartado = "descartado"


class Lead(Base):
    """Solicitud llegada desde la web (u otro origen). Se convierte en Cliente al confirmar."""
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(160))
    telefono: Mapped[str] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(200))
    origen: Mapped[str] = mapped_column(String(30), default="web")
    pagina_origen: Mapped[str | None] = mapped_column(String(300))
    idioma: Mapped[str] = mapped_column(String(5), default="es")
    tienda_id: Mapped[int | None] = mapped_column(ForeignKey("tiendas.id"))
    servicio: Mapped[str] = mapped_column(String(30))  # tattoo | piercing_corporal | piercing_oreja | piercing_nariz
    zona_corporal: Mapped[str | None] = mapped_column(String(80))
    tamano: Mapped[str | None] = mapped_column(String(40))
    fecha_preferida: Mapped[date | None] = mapped_column(Date)
    mensaje: Mapped[str | None] = mapped_column(Text)
    adjuntos: Mapped[list] = mapped_column(JSON, default=list)
    estado: Mapped[EstadoLead] = mapped_column(Enum(EstadoLead), default=EstadoLead.nuevo)
    etiquetas: Mapped[list] = mapped_column(JSON, default=list)
    acepta_privacidad: Mapped[bool] = mapped_column(Boolean)
    acepta_comunicaciones: Mapped[bool] = mapped_column(Boolean, default=False)
    asignado_a: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))
    notas: Mapped[str | None] = mapped_column(Text)
    historial: Mapped[list] = mapped_column(JSON, default=list)  # cambios de estado
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    actualizado: Mapped[datetime] = mapped_column(DateTime, default=ahora, onupdate=ahora)


class EventoWeb(Base):
    """Eventos de conversión anónimos (sin datos personales). Solo se envían con consentimiento de cookies."""
    __tablename__ = "eventos_web"
    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40))
    pagina: Mapped[str | None] = mapped_column(String(300))
    tienda: Mapped[str | None] = mapped_column(String(60))
    servicio: Mapped[str | None] = mapped_column(String(30))
    idioma: Mapped[str | None] = mapped_column(String(5))
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)


# ---------------------------------------------------------------- Facturación
class Descuento(Base):
    """Descuentos predefinidos (amigos, segunda sesión, promoción...). Se pueden aplicar también a mano."""
    __tablename__ = "descuentos"
    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    tipo: Mapped[str] = mapped_column(String(10))            # porcentaje | importe
    valor: Mapped[int] = mapped_column(Integer)              # % entero o céntimos
    solo_gestion: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    desde: Mapped[date | None] = mapped_column(Date)
    hasta: Mapped[date | None] = mapped_column(Date)


class ContadorSerie(Base):
    """Último número de cada serie. Se bloquea la fila al emitir para que la numeración sea correlativa."""
    __tablename__ = "contadores_serie"
    serie: Mapped[str] = mapped_column(String(20), primary_key=True)
    ultimo: Mapped[int] = mapped_column(Integer, default=0)


class Factura(Base):
    """Factura expedida. No se edita ni se borra: se corrige con rectificativa o se anula (registro de anulación).
    Los datos del emisor y del destinatario se copian al emitir."""
    __tablename__ = "facturas"
    __table_args__ = (UniqueConstraint("serie", "numero"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    tienda_id: Mapped[int] = mapped_column(ForeignKey("tiendas.id"))
    tipo: Mapped[str] = mapped_column(String(2))             # F1 completa, F2 simplificada, R1-R5 rectificativa
    serie: Mapped[str] = mapped_column(String(20))
    numero: Mapped[int] = mapped_column(Integer)
    num_serie: Mapped[str] = mapped_column(String(60), unique=True)   # NumSerieFactura (serie-número)
    fecha_expedicion: Mapped[date] = mapped_column(Date)
    fecha_operacion: Mapped[date | None] = mapped_column(Date)
    emisor: Mapped[dict] = mapped_column(JSON)               # nif, razon_social, domicilio
    destinatario: Mapped[dict | None] = mapped_column(JSON)  # nombre, nif, domicilio (obligatorio en F1)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("clientes.id"))
    descripcion: Mapped[str] = mapped_column(String(500))    # DescripcionOperacion
    desglose: Mapped[list] = mapped_column(JSON)             # [{iva_x100, base_cent, cuota_cent}]
    base_cent: Mapped[int] = mapped_column(Integer)
    cuota_cent: Mapped[int] = mapped_column(Integer)
    total_cent: Mapped[int] = mapped_column(Integer)
    forma_pago: Mapped[str | None] = mapped_column(String(20))
    rectificada_id: Mapped[int | None] = mapped_column(ForeignKey("facturas.id"))
    tipo_rectificacion: Mapped[str | None] = mapped_column(String(1))  # S sustitución | I diferencias
    motivo: Mapped[str | None] = mapped_column(String(250))
    estado: Mapped[str] = mapped_column(String(12), default="emitida")  # emitida | rectificada | anulada
    modo_verifactu: Mapped[str] = mapped_column(String(12), default="desactivado")  # modo al emitir
    creado_por: Mapped[int] = mapped_column(ForeignKey("usuarios.id"))
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)
    lineas: Mapped[list["FacturaLinea"]] = relationship(lazy="selectin", order_by="FacturaLinea.id")


class FacturaLinea(Base):
    __tablename__ = "factura_lineas"
    id: Mapped[int] = mapped_column(primary_key=True)
    factura_id: Mapped[int] = mapped_column(ForeignKey("facturas.id"))
    trabajo_id: Mapped[int | None] = mapped_column(ForeignKey("trabajos.id"))
    descripcion: Mapped[str] = mapped_column(String(250))
    cantidad: Mapped[int] = mapped_column(Integer, default=1)
    precio_cent: Mapped[int] = mapped_column(Integer)        # unitario, IVA incluido, antes de descuento
    descuento_cent: Mapped[int] = mapped_column(Integer, default=0)
    iva_x100: Mapped[int] = mapped_column(Integer)
    base_cent: Mapped[int] = mapped_column(Integer)
    cuota_cent: Mapped[int] = mapped_column(Integer)
    total_cent: Mapped[int] = mapped_column(Integer)


class RegistroFacturacion(Base):
    """Registro de facturación (alta o anulación) encadenado por huella SHA-256, listo para VERI*FACTU.
    La cadena es única por emisor (NIF) y nunca se modifica: solo cambia el estado de envío."""
    __tablename__ = "registros_facturacion"
    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(10))            # alta | anulacion
    factura_id: Mapped[int] = mapped_column(ForeignKey("facturas.id"))
    nif_emisor: Mapped[str] = mapped_column(String(20))
    num_serie: Mapped[str] = mapped_column(String(60))
    fecha_expedicion: Mapped[date] = mapped_column(Date)
    anterior_id: Mapped[int | None] = mapped_column(ForeignKey("registros_facturacion.id"))
    huella_anterior: Mapped[str | None] = mapped_column(String(64))
    huella: Mapped[str] = mapped_column(String(64))
    fecha_hora_gen: Mapped[str] = mapped_column(String(32))  # ISO 8601 con huso, tal cual entra en la huella
    subsanacion: Mapped[bool] = mapped_column(Boolean, default=False)
    estado_envio: Mapped[str] = mapped_column(String(24), default="pendiente")
    # pendiente | no_aplica | enviado | correcto | aceptado_con_errores | incorrecto
    csv_aeat: Mapped[str | None] = mapped_column(String(40))
    respuesta: Mapped[str | None] = mapped_column(Text)
    intentos: Mapped[int] = mapped_column(Integer, default=0)
    enviado: Mapped[datetime | None] = mapped_column(DateTime)
    creado: Mapped[datetime] = mapped_column(DateTime, default=ahora)
