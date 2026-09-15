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

const api = { mount, unmount, version }
window.KorusChat = api
export default api
