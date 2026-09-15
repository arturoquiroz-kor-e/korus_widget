# Contexto — korus-widget

> Última actualización: 2026-09-15 · **W0 y W1 hechos. Siguiente: W2 (auto-montaje por `<script>`, `/w/`).**

## Qué es esto

El widget de chat que un tenant embebe en su portal. Vue 3 compilado como
custom element `<korus-chat>` con Shadow DOM; un solo `dist/widget.js` IIFE
sin dependencias en tiempo de ejecución. Lo sirve `korus_chat` en
`/widget/v1/widget.js` (repo separado por decisión de Arthur del 2026-09-15:
un repo por producto). Diseño completo en
`korus-frontend/docs/LLD-KORUS-CHATBOT-FRONT-001.md`, sección 3; contrato del
gateway en `korus/docs/chat-widget-api.md`.

Estructura: `src/main.js` (registro del elemento + `window.KorusChat`),
`src/ChatWidget.ce.vue` (todo el estado y la UI), `src/api.js` (cliente del
gateway), `src/texts.js` (textos y clasificación de errores), `e2e/` (Playwright
contra `korus_chat` real), `dev/deploy-local.sh`.

## Estado

- **W0** (repo, build, e2e) y **W1** (núcleo) terminados el 2026-09-15 y probados
  contra `korus_chat` local con el fixture de EasyTrip: montaje por API,
  burbuja, opciones, fin de conversación, nueva conversación, restaurar tras
  F5 por `GET`, terminar por el usuario, reintento con el mismo `turnId`,
  `getToken` en cada llamada, origen ajeno, site key inválida, modo `page`,
  aislamiento de CSS con un portal hostil. 26 aserciones.
- Sin probar con datos reales: prompts `text` y `list` (el flujo local no
  llega a ellos porque el conector es `log`; están implementados según el
  contrato). Pendiente un fixture sin servicios en `korus_chat/dev/flows/`.
- Tamaño: 33 KB gzip (tope 60).

## Decisiones (append-only, con el porqué)

- **2026-09-15 — Un origen no registrado se detecta con una sonda a `/health`
  en `no-cors`.** *Por qué:* el navegador bloquea la respuesta por CORS y
  `fetch` lanza el mismo `TypeError` que sin red. Si `/health` contesta, el
  bloqueo fue CORS → `forbidden_origin` (fatal); si no, es red (reintentable).
  Solo se sondea antes del primer éxito: después el origen ya está aceptado.
- **2026-09-15 — Fuente, color y tamaño se fijan en `.kc`, no en `:host`.**
  *Por qué:* el CSS del anfitrión alcanza al elemento host desde fuera (un
  `* { all: unset }` le gana a `:host`) y las propiedades heredadas entran al
  shadow tree. Fijarlas en el primer nodo interno corta la herencia.
- **2026-09-15 — La transcripción se guarda en `sessionStorage` (por site
  key) para sobrevivir un F5, con lo que el usuario escribió a mano
  enmascarado.** *Por qué:* `GET .../{id}` devuelve el prompt vigente pero
  nunca repite mensajes; sin historial local el usuario vería opciones sin la
  pregunta. En preview no se persiste nada.
- **2026-09-15 — `not_found` reinicia en silencio; `conversation_ended` pinta
  el estado terminado.** Según la tabla del contrato.

## Pendientes

- [ ] W2: auto-montaje leyendo `data-*` del `<script>`, `data-mode="page"`
      para `/w/{siteKey}`, `dev/deploy-local.sh` probado con la página hospedada.
- [ ] W3: preview por token (`preview-expired`), tema por atributos, teclado,
      móvil, e2e de `text` y `list` con un fixture sin servicios.
- [ ] Acordar con back el Dockerfile de `korus_chat` (clonar este repo en
      `WIDGET_REF`) y borrar su placeholder `korus_chat/widget/`.

## Trampas

- **Los e2e necesitan una site key con `http://localhost:5175`.** El `:5173`
  suele estar ocupado por otro proyecto. `dev/seed-bot.sh` de korus_chat emite
  una nueva cada vez; se pasa por `SITE_KEY=...`.
- **Un `401 unauthorized` del gateway llega sin cabeceras CORS** (solo las
  pone si la site key resuelve), así que desde el navegador se ve igual que
  `forbidden_origin`. El widget muestra lo mismo en ambos casos y deja la
  pista en consola. Anotado para back por si quiere hacerlo legible.
- **Playwright atraviesa el Shadow DOM** con los locators normales; no hace
  falta `>>>`.
- **`options` es una propiedad, no un atributo**: `el.options = {...}` antes de
  insertar el elemento. Funciones (`getToken`) no viajan por atributos.
