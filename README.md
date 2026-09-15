# korus-widget

Widget embebible de Korus Chat. Un solo `dist/widget.js` (IIFE, ~33 KB gzip)
que `korus_chat` sirve en `/widget/v1/widget.js`. Vue 3 como custom element
`<korus-chat>` con Shadow DOM.

Diseño: `korus-frontend/docs/LLD-KORUS-CHATBOT-FRONT-001.md` (sección 3).
Contrato del gateway: `korus/docs/chat-widget-api.md`.

## Uso

```html
<!-- Embebido (auto-montaje, bloque W2) -->
<script src="https://korus-chat.onrender.com/widget/v1/widget.js" data-site-key="kor_site_..." async></script>
```

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
SITE_KEY=kor_site_... npm run e2e   # Playwright contra korus_chat en :8084
```

Los e2e sirven `e2e/pages/host.html` (un portal con CSS hostil a propósito)
en `:5175` y un origen no registrado en `:5176`. Necesitan Chrome instalado y
`korus_chat` corriendo con un bot sembrado (`dev/seed-bot.sh` de korus_chat,
con `http://localhost:5175` entre los orígenes).
