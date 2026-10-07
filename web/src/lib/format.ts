export const euros = (cent: number) =>
  (cent / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: cent % 100 ? 2 : 0 });

export const aCent = (txt: string) => Math.round(parseFloat(txt.replace(",", ".")) * 100) || 0;

export const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const fechaLarga = (iso: string) => {
  const t = new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const hora = (dt: string) => dt.slice(11, 16);

/** Fecha y hora local. Las marcas de la API (creado, historial) vienen en UTC sin zona: utc=true las convierte. */
export const fechaHora = (dt: string, utc = false) =>
  new Date(utc && !/[zZ]|[+-]\d\d:\d\d$/.test(dt) ? dt + "Z" : dt)
    .toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const ROLES: Record<string, string> = {
  admin: "Administración", encargado: "Encargado", tatuador: "Tatuador", piercer: "Piercer", invitado: "Invitado",
};
export const SERVICIOS: Record<string, string> = { tatuaje: "Tatuaje", piercing: "Piercing", producto: "Producto" };
export const SERVICIOS_WEB: Record<string, string> = {
  tattoo: "Tatuaje", piercing_corporal: "Piercing corporal", piercing_oreja: "Piercing de oreja", piercing_nariz: "Piercing de nariz",
};
export const PAGOS: Record<string, string> = { tarjeta: "Tarjeta", efectivo: "Efectivo", bizum: "Bizum", transferencia: "Transferencia" };
export const ESTADOS_CITA: Record<string, string> = {
  reservada: "Reservada", confirmada: "Confirmada", hecha: "Hecha", no_presentado: "No vino", cancelada: "Cancelada",
};
export const ESTADOS_LEAD: Record<string, string> = {
  nuevo: "Nuevo", contactado: "Contactado", pendiente_de_respuesta: "Pendiente de respuesta",
  presupuesto_enviado: "Presupuesto enviado", cita_propuesta: "Cita propuesta", cita_confirmada: "Cita confirmada",
  realizado: "Realizado", cancelado: "Cancelado", descartado: "Descartado",
};
