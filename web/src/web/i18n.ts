import { useLocation } from "react-router-dom";

export type Lang = "es" | "en";

const T = {
  es: {
    reservar: "Reservar cita", verTrabajos: "Ver trabajos", llamar: "Llamar", whatsapp: "WhatsApp", comoLlegar: "Cómo llegar",
    reservarAqui: "Reservar aquí", menu: "Menú", cerrar: "Cerrar",
    nav: { tatuajes: "Tatuajes", piercing: "Piercing", portfolio: "Trabajos", ubicaciones: "Estudios", faq: "Preguntas" },
    heroKicker: "Tatuajes y piercing en Eivissa",
    heroTitulo: "Tu tatuaje en Ibiza, hecho con calma.",
    heroTexto: "Dos estudios en Eivissa, junto al puerto y junto a la playa. Tatuajes y piercing con atención personalizada.",
    confianza: ["Atención personalizada", "Profesionalidad", "Calidad", "Higiene"],
    resenas: "reseñas",
    servicios: "Servicios",
    serv: {
      tattoo: ["Tatuajes", "Diseño personalizado"], piercing_corporal: ["Piercing corporal", "Joyería y cuidados"],
      piercing_oreja: ["Piercing de oreja", "Lóbulo, helix, tragus…"], piercing_nariz: ["Piercing de nariz", "Aleta, septum…"],
    } as Record<string, [string, string]>,
    trabajos: "Trabajos recientes", todo: "Todo", masInstagram: "Más en Instagram", sinFotos: "Pronto publicaremos aquí nuestros trabajos. Mientras, míralos en Instagram.",
    estudios: "Dos estudios en Eivissa", todosLosDias: "Todos los días",
    tagLocal: { puerto: "Junto al puerto", beach: "Junto a la playa" } as Record<string, string>,
    comoReservar: "Cómo reservar",
    pasos: [["Elige servicio y estudio", "Tattoo o piercing, en Puerto o en Beach."], ["Cuéntanos tu idea", "Describe lo que quieres y adjunta referencias."], ["Recibe presupuesto", "Te respondemos por WhatsApp o email."], ["Confirma y ven", "Cerramos fecha y te esperamos."]],
    pedirPresupuesto: "Solicitar presupuesto",
    preguntas: "Preguntas frecuentes",
    faq: ["¿Cómo me preparo?", "¿Hay edad mínima?", "¿Atendéis sin cita?", "¿Cuánto dura una sesión?", "¿Hay que dejar señal?", "¿Cómo puedo pagar?", "¿Y si tengo que cancelar?", "¿Cómo lo cuido después?"],
    faqPendiente: "Escríbenos por WhatsApp y te lo contamos.",
    legal: { privacidad: "Política de privacidad", cookies: "Política de cookies", aviso: "Aviso legal", prefs: "Preferencias de cookies" },
    // formulario
    paso: "Paso", de: "de", queTeHacemos: "¿Qué te hacemos?", enQueEstudio: "¿En qué estudio?",
    tuIdea: "Cuéntanos tu idea", descripcion: "Descripción", descripcionPh: "Estilo, tamaño, colores, lo que se te ocurra",
    zona: "Zona del cuerpo", zonaPh: "Antebrazo", tamano: "Tamaño aproximado",
    tamanos: ["Menos de 5 cm", "5–10 cm", "10–20 cm", "Más grande"],
    adjuntar: "Adjuntar referencias", adjuntarNota: "Hasta 5 imágenes de 8 MB", quitar: "Quitar",
    contacto: "¿Cómo te contactamos?", nombre: "Nombre", telefono: "Teléfono o WhatsApp", email: "Email", opcional: "opcional",
    fecha: "Fecha preferida", aceptoPriv: "He leído y acepto la", aceptoCom: "Quiero recibir novedades y promociones",
    continuar: "Continuar", atras: "Atrás", enviar: "Enviar solicitud", enviando: "Enviando…",
    enviado: "Solicitud enviada", enviadoTxt: "Te escribimos por WhatsApp con el presupuesto. Si tienes prisa, llámanos.",
    abrirWhatsapp: "Abrir WhatsApp", volverInicio: "Volver al inicio",
    errores: { servicio: "Elige un servicio", nombre: "Escribe tu nombre", telefono: "Escribe un teléfono válido", privacidad: "Acepta la política de privacidad para continuar", archivos: "Máximo 5 imágenes de hasta 8 MB" },
    // cookies
    ckTitulo: "Cookies", ckTexto: "Usamos cookies necesarias para que la web funcione y, si nos dejas, de analítica para saber qué secciones se usan.",
    rechazar: "Rechazar", aceptar: "Aceptar", configurar: "Configurar", preferencias: "Preferencias", guardar: "Guardar", rechazarTodo: "Rechazar todo",
    ckTipos: [["Necesarias", "Idioma, preferencias de cookies y seguridad del formulario. Siempre activas."], ["Analítica", "Contamos clics en llamar, WhatsApp, cómo llegar y formularios, sin datos personales."], ["Marketing", "Contenido de Instagram incrustado y medición de campañas."]],
    noEncontrado: "Esta página no existe.",
  },
  en: {
    reservar: "Book now", verTrabajos: "See our work", llamar: "Call", whatsapp: "WhatsApp", comoLlegar: "Directions",
    reservarAqui: "Book here", menu: "Menu", cerrar: "Close",
    nav: { tatuajes: "Tattoos", piercing: "Piercing", portfolio: "Work", ubicaciones: "Studios", faq: "FAQ" },
    heroKicker: "Tattoo and piercing in Ibiza",
    heroTitulo: "Your Ibiza tattoo, done without rushing.",
    heroTexto: "Two studios in Eivissa, by the port and by the beach. Tattoos and piercing with personal attention.",
    confianza: ["Personal attention", "Professional work", "Quality", "Hygiene"],
    resenas: "reviews",
    servicios: "Services",
    serv: {
      tattoo: ["Tattoos", "Custom design"], piercing_corporal: ["Body piercing", "Jewellery and aftercare"],
      piercing_oreja: ["Ear piercing", "Lobe, helix, tragus…"], piercing_nariz: ["Nose piercing", "Nostril, septum…"],
    } as Record<string, [string, string]>,
    trabajos: "Recent work", todo: "All", masInstagram: "More on Instagram", sinFotos: "Our work will appear here soon. Meanwhile, see it on Instagram.",
    estudios: "Two studios in Eivissa", todosLosDias: "Every day",
    tagLocal: { puerto: "By the port", beach: "By the beach" } as Record<string, string>,
    comoReservar: "How to book",
    pasos: [["Pick a service and studio", "Tattoo or piercing, at Puerto or Beach."], ["Tell us your idea", "Describe it and attach references."], ["Get a quote", "We reply by WhatsApp or email."], ["Confirm and come in", "We set a date and wait for you."]],
    pedirPresupuesto: "Get a quote",
    preguntas: "FAQ",
    faq: ["How should I prepare?", "Is there a minimum age?", "Do you take walk-ins?", "How long is a session?", "Do I need to pay a deposit?", "How can I pay?", "What if I need to cancel?", "How do I look after it?"],
    faqPendiente: "Message us on WhatsApp and we'll tell you.",
    legal: { privacidad: "Privacy policy", cookies: "Cookie policy", aviso: "Legal notice", prefs: "Cookie settings" },
    paso: "Step", de: "of", queTeHacemos: "What would you like?", enQueEstudio: "Which studio?",
    tuIdea: "Tell us your idea", descripcion: "Description", descripcionPh: "Style, size, colours, anything you have in mind",
    zona: "Body area", zonaPh: "Forearm", tamano: "Approximate size",
    tamanos: ["Under 5 cm", "5–10 cm", "10–20 cm", "Bigger"],
    adjuntar: "Attach references", adjuntarNota: "Up to 5 images, 8 MB each", quitar: "Remove",
    contacto: "How can we reach you?", nombre: "Name", telefono: "Phone or WhatsApp", email: "Email", opcional: "optional",
    fecha: "Preferred date", aceptoPriv: "I have read and accept the", aceptoCom: "Send me news and offers",
    continuar: "Continue", atras: "Back", enviar: "Send request", enviando: "Sending…",
    enviado: "Request sent", enviadoTxt: "We'll message you on WhatsApp with a quote. In a hurry? Give us a call.",
    abrirWhatsapp: "Open WhatsApp", volverInicio: "Back to home",
    errores: { servicio: "Choose a service", nombre: "Enter your name", telefono: "Enter a valid phone number", privacidad: "Accept the privacy policy to continue", archivos: "Up to 5 images of 8 MB max" },
    ckTitulo: "Cookies", ckTexto: "We use cookies the site needs to work and, if you agree, analytics cookies to see which sections people use.",
    rechazar: "Reject", aceptar: "Accept", configurar: "Settings", preferencias: "Preferences", guardar: "Save", rechazarTodo: "Reject all",
    ckTipos: [["Necessary", "Language, cookie choices and form security. Always on."], ["Analytics", "We count clicks on call, WhatsApp, directions and forms, without personal data."], ["Marketing", "Embedded Instagram content and campaign measurement."]],
    noEncontrado: "This page doesn't exist.",
  },
};

export type Textos = typeof T.es;

export function useLang(): { lang: Lang; t: Textos; ruta: (p: string) => string } {
  const { pathname } = useLocation();
  const lang: Lang = pathname === "/en" || pathname.startsWith("/en/") ? "en" : "es";
  return { lang, t: T[lang] as Textos, ruta: (p) => (lang === "en" ? "/en" + (p === "/" ? "" : p) : p) };
}

/** La misma página en el otro idioma. */
export function otraLengua(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname === "/" ? "/en" : "/en" + pathname;
}
