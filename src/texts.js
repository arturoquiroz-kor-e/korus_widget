// Textos del widget. Los códigos de error son contrato del gateway; el texto
// es nuestro. Un código desconocido cae en el genérico.

export const ERROR_TEXTS = {
  unauthorized: 'Este chat no está disponible en esta página.',
  forbidden_origin: 'Este chat no está disponible en esta página.',
  bot_not_published: 'El asistente todavía no está disponible.',
  identity_required: 'Inicia sesión para usar el asistente.',
  preview_expired: 'La vista previa expiró.',
  rate_limited: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  invalid_request: 'No pudimos procesar tu mensaje.',
  internal_error: 'No pudimos procesar tu mensaje. Intenta de nuevo.',
  network: 'No hay conexión. Intenta de nuevo.'
}

// Errores tras los que no tiene sentido reintentar ni seguir: se apaga el chat
export const FATAL_ERRORS = new Set(['unauthorized', 'forbidden_origin', 'bot_not_published', 'identity_required'])

// Errores que se resuelven repitiendo la misma petición (mismo turnId)
export const RETRYABLE_ERRORS = new Set(['internal_error', 'network', 'rate_limited'])

export const TEXTS = {
  open: 'Abrir chat',
  close: 'Cerrar',
  endConversation: 'Terminar conversación',
  newConversation: 'Nueva conversación',
  retry: 'Reintentar',
  send: 'Enviar',
  prev: 'Anterior',
  next: 'Siguiente',
  page: (current, totalPages) => totalPages ? `Página ${current} de ${totalPages}` : (current ? `Página ${current}` : ''),
  ended: 'La conversación terminó.',
  expired: 'La conversación expiró por inactividad.',
  restored: 'Conversación restaurada.',
  typing: 'Escribiendo…',
  previewLabel: 'Vista previa',
  errorTitle: 'Chat no disponible'
}
