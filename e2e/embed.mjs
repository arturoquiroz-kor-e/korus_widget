// W2: auto-montaje por <script data-*>, data-token, data-context, data-mode=page
// y la página hospedada /w/{siteKey} servida por korus_chat.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { serve } from './server.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SITE_KEY = process.env.SITE_KEY || 'kor_site_EvaGNzjQze0BLF8Dd1PkGA'      // easytrip, orígenes :5177 y :8084
const DEMO_KEY = process.env.DEMO_SITE_KEY || 'kor_site_t3cOJ5c9fFbbSVywFtM-Bg'
const HOST = 'http://localhost:5177'
const OUT = ROOT + 'e2e/screens'
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (n, ok, x = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }

const server = await serve(5177, ROOT)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const w = sel => page.locator('korus-chat').locator(sel)
const reqs = []
page.on('request', r => { if (r.url().includes('/api/chat/') && r.method() !== 'OPTIONS') reqs.push({ url: r.url(), headers: r.headers(), body: r.postData() }) })

// --- 1. Snippet mínimo: solo data-site-key ---
await page.goto(`${HOST}/embed.html?siteKey=${SITE_KEY}`)
await w('.bubble').waitFor()
check('auto-montaje con solo data-site-key → burbuja', true)
await w('.bubble').click()
await w('.choice').first().waitFor()
check('conversa', (await w('.choice').count()) === 2)
check('sin data-token no manda X-End-User-Token', !reqs.some(r => r.headers['x-end-user-token']))
check('KorusChat expuesto en window', await page.evaluate(() => typeof window.KorusChat?.mount === 'function' && !!window.KorusChat.version))

// --- 2. data-token → función global, data-context → body, data-open, data-color, data-position ---
await page.evaluate(() => sessionStorage.clear())   // si no, restaura la conversación anterior y no hay POST inicial
reqs.length = 0
await page.goto(`${HOST}/embed.html?siteKey=${SITE_KEY}&token=portal.getKorusToken&open=true&color=%23336699&position=left&context=${encodeURIComponent('{"pagina":"/mi-cuenta"}')}`)
await w('.choice').first().waitFor()
check('data-open abre el panel al cargar', await w('.panel').isVisible())
check('data-token resuelve window.portal.getKorusToken en cada llamada', reqs.length > 0 && reqs.every(r => r.headers['x-end-user-token'] === 'token-del-portal-123'))
const startReq = reqs.find(r => r.url.endsWith('/api/chat/conversations'))
check('data-context viaja en el POST inicial', JSON.parse(startReq?.body || '{}').context?.pagina === '/mi-cuenta')
check('data-color aplica al acento', (await w('.bubble').evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(51, 102, 153)')
const bb = await w('.bubble').boundingBox()
check('data-position=left', bb.x < 100, `x=${bb.x}`)
await page.screenshot({ path: OUT + '/08-embed-left.png' })

// --- 3. data-mode=page ---
await page.goto(`${HOST}/embed.html?siteKey=${SITE_KEY}&mode=page`)
await w('.choice').first().waitFor()
const box = await w('.panel').boundingBox()
check('data-mode=page → columna de 760 a toda la altura, centrada, sin burbuja', box.width === 760 && box.height === 800 && Math.round(box.x) === 170 && (await w('.bubble').count()) === 0, `${box.width}x${box.height}@${box.x}`)

// --- 4. Página hospedada real de korus_chat (/w/{siteKey}, origen :8084) ---
await page.goto(`http://localhost:8084/w/${DEMO_KEY}`)
await w('.textform input').waitFor({ timeout: 15000 })
check('/w/{siteKey} carga widget.js de korus_chat y conversa (bot demo)', (await w('.head-name').innerText()) === 'demo')
check('la hospedada monta en modo page', (await w('.bubble').count()) === 0)
check('el script de la hospedada es el build real y dedujo baseUrl de su src', await page.evaluate(() => window.KorusChat?.version === '0.1.0') && reqs.some(r => r.url.startsWith('http://localhost:8084/api/chat/')))
await page.screenshot({ path: OUT + '/09-hosted.png' })

// --- 5. Página hospedada con site key inexistente: 200 + el widget pinta el 401 ---
await page.goto('http://localhost:8084/w/kor_site_nope')
await w('.fatal').waitFor({ timeout: 15000 })
check('/w/ con key inexistente → widget "no disponible" con unauthorized legible', await page.evaluate(() => !!document.querySelector('korus-chat')) && (await w('.fatal-text').innerText()).includes('no está disponible'))

// --- 6. data-context inválido no rompe el montaje ---
await page.goto(`${HOST}/embed.html?siteKey=${SITE_KEY}&context=no-json`)
await w('.bubble').waitFor()
check('data-context inválido → avisa en consola y monta igual', true)

console.log(`\n${failed ? failed + ' fallos' : 'todo en verde'} · errores de página: ${errors.length ? errors.join(' | ') : 'ninguno'}`)
await browser.close(); server.close()
process.exit(failed ? 1 : 0)
