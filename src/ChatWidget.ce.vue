<template>
  <div class="kc" :class="[`mode-${mode}`, `pos-${position}`, { open }]" :style="{ '--kc-accent': color }">
    <!-- Burbuja flotante (solo modo bubble) -->
    <button
      v-if="mode === 'bubble'"
      class="bubble"
      type="button"
      :aria-label="open ? T.close : T.open"
      :aria-expanded="open"
      @click="toggle"
    >
      <span v-if="!open" class="bubble-icon">💬</span>
      <span v-else class="bubble-icon">✕</span>
    </button>

    <section v-show="open || mode !== 'bubble'" class="panel" role="dialog" :aria-label="botName || 'Chat'" @keydown.esc="onEsc">
      <header class="head">
        <div class="head-title">
          <span class="head-name">{{ botName || '…' }}</span>
          <span v-if="preview" class="head-badge">{{ T.previewLabel }}</span>
        </div>
        <div class="head-actions">
          <button v-if="conversationId && !ended && !fatal" type="button" class="head-btn" :title="T.endConversation" @click="endConversation">{{ T.endConversation }}</button>
          <button v-if="mode === 'bubble'" type="button" class="head-btn" :aria-label="T.close" @click="toggle">✕</button>
        </div>
      </header>

      <!-- Estado fatal: integración rota, sin sesión, bot sin publicar -->
      <div v-if="fatal" class="fatal">
        <div class="fatal-title">{{ T.errorTitle }}</div>
        <div class="fatal-text">{{ errorText(fatal) }}</div>
      </div>

      <template v-else>
        <div ref="logRef" class="log" aria-live="polite">
          <div v-for="(m, i) in transcript" :key="i" class="msg" :class="m.role">
            <div class="msg-body">{{ m.text }}</div>
          </div>
          <div v-if="busy" class="msg bot typing"><div class="msg-body">{{ T.typing }}</div></div>
          <div v-if="notice" class="notice">{{ notice }}</div>
          <div v-if="error" class="error">
            <span>{{ errorText(error) }}</span>
            <button v-if="canRetry" type="button" class="link" @click="retry">{{ T.retry }}</button>
          </div>
        </div>

        <footer class="input">
          <!-- Terminada -->
          <button v-if="ended" type="button" class="primary wide" @click="restart">{{ T.newConversation }}</button>

          <!-- options / list -->
          <template v-else-if="prompt?.type === 'options' || prompt?.type === 'list'">
            <div class="choices">
              <button
                v-for="o in choices"
                :key="o.value"
                type="button"
                class="choice"
                :disabled="busy"
                @click="sendOption(o)"
              >{{ o.label }}</button>
            </div>
            <div v-if="prompt.type === 'list' && prompt.page" class="pager">
              <button type="button" class="link" :disabled="busy || !prompt.page.hasPrev" @click="sendPage('prev')">‹ {{ T.prev }}</button>
              <span class="pager-info">{{ T.page(prompt.page.current, prompt.page.totalPages) }}</span>
              <button type="button" class="link" :disabled="busy || !prompt.page.hasNext" @click="sendPage('next')">{{ T.next }} ›</button>
            </div>
          </template>

          <!-- text -->
          <form v-else-if="prompt?.type === 'text'" class="textform" @submit.prevent="sendText">
            <input
              ref="textRef"
              v-model="textValue"
              :type="inputType"
              :placeholder="prompt.placeholder || ''"
              :maxlength="prompt.maxLength || undefined"
              :disabled="busy"
              autocomplete="off"
            />
            <button type="submit" class="primary" :disabled="busy || !textValue.trim()">{{ T.send }}</button>
          </form>
        </footer>
      </template>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { createClient, GatewayError } from './api'
import { ERROR_TEXTS, FATAL_ERRORS, RETRYABLE_ERRORS, TEXTS as T } from './texts'

// Se monta por API: KorusChat.mount(el, options). Ver README para las opciones.
const props = defineProps({
  options: { type: Object, required: true }
})
const emit = defineEmits(['ready', 'ended', 'preview-expired', 'error'])

const o = props.options
const mode = o.mode || 'bubble'              // bubble | page | inline
const position = o.position || 'right'
const color = o.color || '#d4922a'
const preview = !!o.previewToken
const client = createClient({
  baseUrl: o.baseUrl,
  siteKey: o.siteKey,
  previewToken: o.previewToken,
  getToken: o.getToken
})

// ---- estado ----
const open = ref(mode !== 'bubble' || !!o.openOnLoad)
const conversationId = ref(null)
const botName = ref('')
const transcript = ref([])           // { role: 'bot' | 'user', text, sensitive? }
const prompt = ref(null)
const ended = ref(false)
const busy = ref(false)
const error = ref(null)               // código del gateway
const fatal = ref(null)               // código fatal: apaga el chat
const notice = ref('')
const pending = ref(null)             // { turnId, input, echo } para reintentar con el mismo turnId
const textValue = ref('')
const logRef = ref(null)
const textRef = ref(null)

const choices = computed(() => {
  if (!prompt.value) return []
  return prompt.value.type === 'list' ? prompt.value.items || [] : prompt.value.options || []
})
const inputType = computed(() => {
  const t = prompt.value?.inputType
  return ['text', 'number', 'email', 'tel', 'date'].includes(t) ? t : 'text'
})
const canRetry = computed(() => !!pending.value && RETRYABLE_ERRORS.has(error.value))

function errorText(code) {
  return ERROR_TEXTS[code] || ERROR_TEXTS.internal_error
}

// ---- persistencia (sessionStorage, por site key; nunca en preview) ----
const storageKey = preview ? null : `korus_chat:${o.siteKey}`

function save() {
  if (!storageKey) return
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({
      conversationId: conversationId.value,
      botName: botName.value,
      // Lo que el usuario escribió a mano no se persiste en claro
      transcript: transcript.value.map(m => m.sensitive ? { ...m, text: '••••••' } : m)
    }))
  } catch { /* storage bloqueado: se vive sin restaurar */ }
}

function load() {
  if (!storageKey) return null
  try {
    return JSON.parse(sessionStorage.getItem(storageKey) || 'null')
  } catch {
    return null
  }
}

function clearStorage() {
  if (!storageKey) return
  try { sessionStorage.removeItem(storageKey) } catch { /* idem */ }
}

// ---- ciclo ----
function apply(res) {
  conversationId.value = res.conversationId
  if (res.botName) botName.value = res.botName
  for (const m of res.messages || []) transcript.value.push({ role: 'bot', text: m.text })
  prompt.value = res.prompt || { type: 'none' }
  if (res.ended) finish(res.endReason)
  else save()
  scrollToEnd()
}

function finish(reason) {
  ended.value = true
  prompt.value = { type: 'none' }
  notice.value = reason === 'IDLE' || reason === 'MAX_DURATION' ? T.expired : T.ended
  clearStorage()
  emit('ended', { conversationId: conversationId.value, reason })
}

function handleError(e) {
  const code = e instanceof GatewayError ? e.code : 'internal_error'
  if (code === 'conversation_ended') {
    finish('TERMINAL')
    return
  }
  if (code === 'not_found') {
    // Conversación desconocida: se descarta y se empieza otra
    clearStorage()
    conversationId.value = null
    transcript.value = []
    start()
    return
  }
  if (code === 'preview_expired') {
    fatal.value = code
    emit('preview-expired')
    return
  }
  if (FATAL_ERRORS.has(code)) {
    fatal.value = code
    if (code === 'unauthorized' || code === 'forbidden_origin') {
      // Es error de integración, no del usuario: que lo vea quien embebe
      console.error(`[KorusChat] ${code}: revisa que la site key sea válida y que ${location.origin} esté en sus orígenes permitidos.`)
    }
    emit('error', { code })
    return
  }
  error.value = code
  emit('error', { code })
}

async function run(fn) {
  busy.value = true
  error.value = null
  try {
    const res = await fn()
    pending.value = null
    return res
  } catch (e) {
    handleError(e)
    return null
  } finally {
    busy.value = false
  }
}

async function start() {
  ended.value = false
  notice.value = ''
  const res = await run(() => client.start(o.context))
  if (res) {
    apply(res)
    emit('ready', { conversationId: res.conversationId })
  }
}

async function restore(saved) {
  conversationId.value = saved.conversationId
  botName.value = saved.botName || ''
  transcript.value = saved.transcript || []
  const res = await run(() => client.get(saved.conversationId))
  if (res) {
    // GET nunca repite mensajes; el historial es el nuestro
    apply(res)
    if (!res.ended) notice.value = T.restored
  }
}

async function sendTurn(input, echo, sensitive = false) {
  if (busy.value || ended.value) return
  const turnId = pending.value?.turnId || crypto.randomUUID()
  pending.value = { turnId, input, echo, sensitive }
  if (echo) transcript.value.push({ role: 'user', text: echo, sensitive })
  notice.value = ''
  scrollToEnd()
  const res = await run(() => client.turn(conversationId.value, turnId, input))
  if (res) apply(res)
}

function sendOption(opt) {
  sendTurn({ type: 'option', value: opt.value }, opt.label)
}

function sendPage(dir) {
  sendTurn({ type: 'page', value: dir }, null)
}

function sendText() {
  const value = textValue.value.trim()
  if (!value) return
  textValue.value = ''
  sendTurn({ type: 'text', value }, value, true)
}

async function retry() {
  const p = pending.value
  if (!p) return
  // Mismo turnId: el gateway devuelve la misma respuesta si ya lo procesó
  const res = await run(() => client.turn(conversationId.value, p.turnId, p.input))
  if (res) apply(res)
}

async function endConversation() {
  if (!conversationId.value || ended.value) return
  const res = await run(() => client.end(conversationId.value))
  if (res) apply(res)
}

function restart() {
  clearStorage()
  conversationId.value = null
  transcript.value = []
  prompt.value = null
  error.value = null
  pending.value = null
  start()
}

function toggle() {
  open.value = !open.value
}

// Esc cierra el flotante (en page/inline no hay nada que cerrar)
function onEsc() {
  if (mode === 'bubble') open.value = false
}

function scrollToEnd() {
  nextTick(() => {
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
    if (prompt.value?.type === 'text' && !busy.value) textRef.value?.focus()
  })
}

watch(open, v => { if (v) scrollToEnd() })

onMounted(() => {
  const saved = load()
  if (saved?.conversationId) restore(saved)
  else start()
})

defineExpose({ restart, endConversation })
</script>

<style>
:host { display: block; }

/* Las propiedades heredadas (fuente, color) se fijan AQUÍ y no en :host: el
   CSS del anfitrión puede alcanzar al elemento host desde fuera (p. ej. un
   `* { all: unset }`) y ganarle a :host, pero nunca entra al shadow tree. */
.kc {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: #1c1c22;
  text-align: left;
  letter-spacing: normal;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
button:disabled { cursor: not-allowed; opacity: 0.55; }
input { font: inherit; }

.kc { --kc-accent: #d4922a; --kc-bg: #ffffff; --kc-panel: #f6f6f8; --kc-border: #e3e3e8; --kc-muted: #6b6b76; --kc-bot: #f0f0f4; --kc-user: var(--kc-accent); }

/* Modo bubble: botón flotante + panel anclado */
.mode-bubble .bubble {
  position: fixed; bottom: 20px; z-index: 2147483000;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--kc-accent); color: #fff; font-size: 24px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center;
  transition: transform 0.15s;
}
.mode-bubble .bubble:hover { transform: scale(1.05); }
.mode-bubble.pos-right .bubble { right: 20px; }
.mode-bubble.pos-left .bubble { left: 20px; }

.mode-bubble .panel {
  position: fixed; bottom: 88px; z-index: 2147483000;
  width: 370px; max-width: calc(100vw - 32px); height: 540px; max-height: calc(100vh - 110px);
  border-radius: 14px; overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.25);
}
.mode-bubble.pos-right .panel { right: 20px; }
.mode-bubble.pos-left .panel { left: 20px; }

@media (max-width: 480px) {
  .mode-bubble.open .panel { inset: 0; width: 100%; max-width: none; height: 100%; max-height: none; border-radius: 0; }
  .mode-bubble.open .bubble { display: none; }
}

/* Modo page (pantalla completa) e inline (llena su contenedor) */
.mode-page .panel {
  position: fixed; inset: 0;
  /* En escritorio una columna legible; en móvil todo el ancho */
  max-width: 760px; margin: 0 auto;
  border-left: 1px solid var(--kc-border); border-right: 1px solid var(--kc-border);
}
.kc.mode-inline { height: 100%; }
.mode-inline .panel { position: relative; width: 100%; height: 100%; min-height: 420px; border: 1px solid var(--kc-border); border-radius: 12px; overflow: hidden; }

.panel { display: flex; flex-direction: column; background: var(--kc-bg); }

.head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 12px 14px; background: var(--kc-accent); color: #fff;
}
.head-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.head-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.head-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: rgba(255,255,255,0.25); }
.head-actions { display: flex; gap: 4px; flex-shrink: 0; }
.head-btn { font-size: 12px; padding: 4px 8px; border-radius: 6px; color: #fff; opacity: 0.9; }
.head-btn:hover { background: rgba(255,255,255,0.18); opacity: 1; }

.log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: var(--kc-panel); }
.msg { display: flex; }
.msg.bot { justify-content: flex-start; }
.msg.user { justify-content: flex-end; }
.msg-body { max-width: 82%; padding: 9px 12px; border-radius: 14px; white-space: pre-wrap; word-break: break-word; }
.msg.bot .msg-body { background: var(--kc-bot); border-bottom-left-radius: 4px; }
.msg.user .msg-body { background: var(--kc-user); color: #fff; border-bottom-right-radius: 4px; }
.msg.typing .msg-body { color: var(--kc-muted); font-style: italic; }

.notice { text-align: center; font-size: 12px; color: var(--kc-muted); padding: 4px 0; }
.error { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: #b23b3b; background: #fbeaea; padding: 8px 12px; border-radius: 8px; }

.input { padding: 10px 12px; border-top: 1px solid var(--kc-border); background: var(--kc-bg); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice {
  padding: 8px 12px; border-radius: 18px; border: 1px solid var(--kc-accent); color: var(--kc-accent);
  font-size: 13px; background: #fff; text-align: left; transition: background 0.15s, color 0.15s;
}
.choice:hover:not(:disabled) { background: var(--kc-accent); color: #fff; }
.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 12px; color: var(--kc-muted); }
.link { color: var(--kc-accent); font-size: 12px; padding: 4px 6px; border-radius: 6px; }
.link:hover:not(:disabled) { text-decoration: underline; }

.textform { display: flex; gap: 8px; }
.textform input {
  flex: 1; padding: 9px 12px; border: 1px solid var(--kc-border); border-radius: 8px; outline: none; background: #fff; color: inherit;
}
.textform input:focus { border-color: var(--kc-accent); }
.primary { padding: 9px 14px; border-radius: 8px; background: var(--kc-accent); color: #fff; font-weight: 500; }
.primary.wide { width: 100%; }

.fatal { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; color: var(--kc-muted); }
.fatal-title { font-weight: 600; color: #1c1c22; margin-bottom: 6px; }
</style>
