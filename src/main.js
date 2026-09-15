import { defineCustomElement } from 'vue'
import ChatWidget from './ChatWidget.ce.vue'
import { version } from '../package.json'

// <korus-chat> con Shadow DOM: el CSS del anfitrión no entra y el nuestro no sale
const KorusChatElement = defineCustomElement(ChatWidget)
if (!customElements.get('korus-chat')) customElements.define('korus-chat', KorusChatElement)

let current = null

/**
 * Monta el widget.
 *   target   elemento contenedor, o null/undefined para el flotante (se cuelga de <body>)
 *   options  { baseUrl, siteKey | previewToken, getToken?, context?, mode?, position?, color?, openOnLoad? }
 * Devuelve el elemento <korus-chat>; escucha 'ready', 'ended', 'preview-expired', 'error'.
 */
function mount(target, options = {}) {
  if (!options.baseUrl) throw new Error('KorusChat.mount: falta baseUrl')
  if (!options.siteKey && !options.previewToken) throw new Error('KorusChat.mount: falta siteKey o previewToken')
  if (options.siteKey && options.previewToken) throw new Error('KorusChat.mount: siteKey y previewToken son excluyentes')
  unmount()
  const el = document.createElement('korus-chat')
  el.options = options
  ;(target || document.body).appendChild(el)
  current = el
  return el
}

function unmount() {
  if (current) {
    current.remove()
    current = null
  }
}

// "miApp.getToken" → window.miApp.getToken, resuelto en cada llamada para que
// el anfitrión pueda definir la función después de cargar el script.
function globalFunction(path) {
  return () => {
    const fn = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), window)
    return typeof fn === 'function' ? fn() : null
  }
}

// Auto-montaje: <script src=".../widget.js" data-site-key="kor_site_..." async>
//   data-mode      bubble (default) | page | inline
//   data-token     nombre de una función global que devuelve el token del usuario final
//   data-base-url  por defecto, el origen del propio script
//   data-color, data-position, data-open, data-context (JSON)
function autoMount() {
  const script = document.currentScript || Array.from(document.querySelectorAll('script[data-site-key]')).pop()
  const d = script?.dataset
  if (!d?.siteKey) return
  let context
  if (d.context) {
    try { context = JSON.parse(d.context) } catch { console.error('[KorusChat] data-context no es JSON válido') }
  }
  const options = {
    baseUrl: d.baseUrl || new URL(script.src, location.href).origin,
    siteKey: d.siteKey,
    mode: d.mode || 'bubble',
    position: d.position,
    color: d.color,
    openOnLoad: d.open === 'true',
    context,
    getToken: d.token ? globalFunction(d.token) : undefined
  }
  const run = () => mount(null, options)
  // Con `async` el script puede ejecutarse antes de que exista <body>
  if (document.body) run()
  else document.addEventListener('DOMContentLoaded', run, { once: true })
}

const api = { mount, unmount, version }
window.KorusChat = api
autoMount()
export default api
