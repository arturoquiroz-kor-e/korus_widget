# korus-widget

Widget embebible de Korus Chat. Un solo `dist/widget.js` (IIFE, ~33 KB gzip)
que `korus_chat` sirve en `/widget/v1/widget.js`. Vue 3 como custom element
`<korus-chat>` con Shadow DOM.

Diseño: `korus-frontend/docs/LLD-KORUS-CHATBOT-FRONT-001.md` (sección 3).
Contrato del gateway: `korus/docs/chat-widget-api.md`.

## Uso

```html
<!-- Embebido: se monta solo al cargar -->
<script src="https://korus-chat.onrender.com/widget/v1/widget.js"
        data-site-key="kor_site_..."
        data-token="miApp.getKorusToken"   <!-- opcional: función global que devuelve el token del usuario; se llama en cada turno -->
        data-mode="bubble"                 <!-- bubble (default) | page | inline -->
        data-position="right"              <!-- right | left -->
        data-color="#d4922a"
        data-open="false"
        data-context='{"pagina":"/inicio"}'
        async></script>
```
`baseUrl` se deduce del `src` del script; `data-base-url` lo fuerza. La página
hospedada `https://korus-chat.onrender.com/w/{siteKey}` usa este mismo script
con `data-mode="page"`.

```js
// Montaje por API
const el = KorusChat.mount(container /* o null = flotante */, {
  baseUrl: 'https://korus-chat.onrender.com',
  siteKey: 'kor_site_...',          // o previewToken (excluyentes)
  getToken: () => tokenDelUsuario,  // opcional; se llama en cada turno
  context: { pagina: '/inicio' },   // opcional; variables user.* no sensibles
  mode: 'bubble',                   // bubble | page | inline
  position: 'right',                // right | left
  color: '#d4922a',
  openOnLoad: false
})
el.addEventListener('ended', e => ...)   // ready | ended | error | preview-expired
KorusChat.unmount()
```

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5175 — pide una site key con ese origen
npm run build        # dist/widget.js
dev/deploy-local.sh  # lo copia a ../korus_chat para probar /w/{siteKey}
SITE_KEY=kor_site_... npm run e2e   # Playwright contra korus_chat en :8084 (ver abajo)
```

Los e2e sirven `e2e/pages/host.html` (un portal con CSS hostil a propósito)
en `:5177` y un origen no registrado en `:5178` (puertos distintos del dev
server para poder correrlos con él abierto). Necesitan Chrome instalado y
`korus_chat` corriendo con los bots sembrados con `http://localhost:5177`
entre los orígenes:

```bash
# en korus_chat, con CHAT_CONNECTOR=http y perfil local
dev/seed-bot.sh "Tenant Prueba" easytrip dev/flows/easytrip-tag.json       http://localhost:5177 http://localhost:8084
dev/seed-bot.sh "Tenant Prueba" demo     dev/flows/demo-capture-list.json  http://localhost:5177 http://localhost:8084
SITE_KEY=... npm run e2e                 # recorrido easytrip
DEMO_SITE_KEY=... node e2e/demo.mjs      # recorrido demo (text, list, paginación)
node e2e/embed.mjs                       # snippet <script data-*>, data-token/context, /w/{siteKey} real
```
