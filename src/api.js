// Cliente del gateway de korus_chat (korus/docs/chat-widget-api.md).
// Toda respuesta de error es { error: "<codigo>" }; aquí se convierte en
// GatewayError con ese código. Los fallos de red salen como código "network".

export class GatewayError extends Error {
  constructor(code, status) {
    super(code)
    this.code = code
    this.status = status
  }
}

export function createClient({ baseUrl, siteKey, previewToken, getToken }) {
  const base = baseUrl.replace(/\/$/, '')

  async function headers() {
    const h = { 'Content-Type': 'application/json' }
    // Preview y site key son excluyentes: el token de preview reemplaza a la key
    if (previewToken) h['X-Preview-Token'] = previewToken
    else h['X-Site-Key'] = siteKey
    // La identidad del usuario final se pide en CADA turno (el motor no la
    // guarda); el anfitrión puede renovarla sin recargar.
    if (getToken) {
      const token = await getToken()
      if (token) h['X-End-User-Token'] = token
    }
    return h
  }

  // Un Origin no registrado no llega como 403: el preflight CORS falla y fetch
  // lanza un TypeError igual que sin red. Solo en el primer contacto (antes
  // de que alguna llamada haya tenido éxito) se distingue sondeando /health en
  // modo no-cors: si el servidor contesta (aunque sea opaco), el bloqueo fue
  // CORS → forbidden_origin; si no, es red de verdad. Después del primer
  // éxito el origen ya está aceptado: cualquier fallo es red.
  let everSucceeded = false

  async function classifyNetworkFailure() {
    if (everSucceeded) return 'network'
    try {
      await fetch(base + '/health', { mode: 'no-cors', cache: 'no-store' })
      return 'forbidden_origin'
    } catch {
      return 'network'
    }
  }

  async function request(method, path, body) {
    let res
    try {
      res = await fetch(base + path, {
        method,
        headers: await headers(),
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch {
      throw new GatewayError(await classifyNetworkFailure(), 0)
    }
    if (res.ok) {
      everSucceeded = true
      return res.status === 204 ? null : res.json()
    }
    let code = 'internal_error'
    try {
      code = (await res.json()).error || code
    } catch {
      // cuerpo vacío o no JSON: se queda el genérico
    }
    throw new GatewayError(code, res.status)
  }

  return {
    start: (context) => request('POST', '/api/chat/conversations', context ? { context } : {}),
    turn: (id, turnId, input) => request('POST', `/api/chat/conversations/${id}/turns`, { turnId, input }),
    get: (id) => request('GET', `/api/chat/conversations/${id}`),
    end: (id) => request('POST', `/api/chat/conversations/${id}/end`)
  }
}
