# Contexto — korus-widget

> Última actualización: 2026-09-15 · **W0–W2 hechos. Siguiente: W3 (preview por token, tema, teclado) junto con P3 del panel.**

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
- `text` y `list` probados con datos reales contra el bot `demo`
  (`korus_chat/dev/flows/demo-capture-list.json` + back simulado
  `/dev/mock/**` del perfil `local`, conector HTTP real): capture text/email/
  number con reintentos, sensible enmascarado en storage, lista de 3 páginas
  con avance/retroceso, decisión, opciones y POST. 17 aserciones más
  (`e2e/demo.mjs`).
- **W2** terminado el 2026-09-15: auto-montaje leyendo `data-*` del propio
  `<script>` (`data-site-key`, `-mode`, `-token`, `-context`, `-color`,
  `-position`, `-open`, `-base-url`), `baseUrl` deducido del `src`, `data-token`
  resuelto por ruta con puntos en `window` en cada llamada, modo `page` con
  columna de 760 px centrada, y la página hospedada `/w/{siteKey}` de
  `korus_chat` probada con el build real (incluida key inexistente → widget
  pinta `unauthorized`). 15 aserciones (`e2e/embed.mjs`).
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

- [ ] W3: preview por token (`preview-expired`), tema por atributos, teclado,
      móvil, e2e de `text` y `list` con un fixture sin servicios.
- [ ] Acordar con back el Dockerfile de `korus_chat` (clonar este repo en
      `WIDGET_REF`) y borrar su placeholder `korus_chat/widget/`.

## Trampas

- **Los e2e corren en `:5177`/`:5178`, no en el puerto del dev server
  (`:5175`)**, para poder correrlos con `npm run dev` abierto. Necesitan site
  keys con `http://localhost:5177` (ver README). `dev/seed-bot.sh` de
  korus_chat emite una nueva cada vez; se pasan por `SITE_KEY` y
  `DEMO_SITE_KEY`.
- **korus_chat cachea las site keys 60 s.** Tras sembrar una, el preflight
  CORS no conoce el origen hasta un minuto después: el widget lo ve como
  `forbidden_origin`. No es un bug: esperar.
- Los rechazos del gateway (401/403/429) ya llevan CORS si el `Origin` está
  registrado en alguna site key (back lo añadió el 2026-09-15), así que
  `unauthorized` se lee. Un origen que no está en ninguna sigue tapado por el
  navegador y cae en la sonda a `/health`.
- **Playwright atraviesa el Shadow DOM** con los locators normales; no hace
  falta `>>>`.
- **`dev/deploy-local.sh` copia también a `target/classes`**: con
  `spring-boot:run` los estáticos se sirven desde ahí, y así korus_chat sirve
  el build nuevo sin reiniciar.
- **Con el snippet en una página que no es de korus_chat, `baseUrl` deducido
  apunta a esa página.** Es lo correcto en producción (el script siempre viene
  de korus_chat); en pruebas se fuerza con `data-base-url`.
- **`data-context` solo viaja al iniciar.** Si hay conversación guardada, se
  restaura por `GET` y el contexto no se manda.
- **`options` es una propiedad, no un atributo**: `el.options = {...}` antes de
  insertar el elemento. Funciones (`getToken`) no viajan por atributos.
