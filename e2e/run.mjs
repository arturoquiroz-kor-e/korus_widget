import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { serve } from './server.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SITE_KEY = process.env.SITE_KEY || 'kor_site_-Uu80WM5BSQi-N7EY0Mppw'   // orígenes: localhost:5175 y :8084
const HOST = 'http://localhost:5175'
const OUT = ROOT + 'e2e/screens'
mkdirSync(OUT, { recursive: true })

let failed = 0
const check = (n, ok, x = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }

const s1 = await serve(5175, ROOT)
const s2 = await serve(5176, ROOT)   // origen NO registrado
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))

// Todo vive en el shadow root; Playwright lo atraviesa con los locators normales
const w = sel => page.locator('korus-chat').locator(sel)
const texts = async sel => (await w(sel).allInnerTexts()).map(t => t.trim())
const turnIds = []
page.on('request', r => { if (r.url().includes('/turns') && r.method() === 'POST') turnIds.push(JSON.parse(r.postData()).turnId) })

// --- 1. Montaje, burbuja, Shadow DOM ---
await page.goto(`${HOST}/host.html?siteKey=${SITE_KEY}`)
await w('.bubble').waitFor()
check('shadow root presente', await page.evaluate(() => !!document.querySelector('korus-chat').shadowRoot))
const bubbleBg = await w('.bubble').evaluate(el => getComputedStyle(el).backgroundColor)
check('CSS hostil del portal no entra (burbuja con el acento, no roja)', bubbleBg === 'rgb(212, 146, 42)', bubbleBg)
const font = await w('.kc').evaluate(el => getComputedStyle(el).fontFamily)
check('la fuente del portal (Comic Sans) no se hereda', !font.includes('Comic'), font)
check('panel cerrado al inicio', !(await w('.panel').isVisible()))
await w('.bubble').click()
await w('.msg.bot').first().waitFor()
check('abre y muestra el saludo en dos mensajes', (await texts('.msg.bot')).join(' | ').includes('Hola, soy el asistente de EasyTrip. | Que necesitas?'))
check('botName en cabecera', (await w('.head-name').innerText()) === 'easytrip')
check('dos opciones', (await texts('.choice')).join(',') === 'Reactivar mi TAG,Horarios y tarifas')
check('evento ready', await page.evaluate(() => window.__events.some(e => e.type === 'ready')))
await page.screenshot({ path: OUT + '/01-open.png' })

// --- 2. Opción → fin de conversación (anónimo pide login) ---
await w('.choice:has-text("Reactivar mi TAG")').click()
await w('.primary.wide').waitFor()
check('eco de la opción como burbuja propia', (await texts('.msg.user'))[0] === 'Reactivar mi TAG')
check('mensaje final del bot', (await texts('.msg.bot')).at(-1).includes('inicia sesion'))
check('aviso de terminada + botón Nueva conversación', (await w('.notice').innerText()).includes('terminó') && (await w('.primary.wide').innerText()) === 'Nueva conversación')
check('evento ended con reason', await page.evaluate(() => window.__events.some(e => e.type === 'ended' && e.detail?.reason === 'TERMINAL')))
check('sessionStorage limpio al terminar', await page.evaluate(k => sessionStorage.getItem('korus_chat:' + k) === null, SITE_KEY))
await page.screenshot({ path: OUT + '/02-ended.png' })

// --- 3. Nueva conversación → rama con servicio (conector log → onFailure → cierre) ---
await w('.primary.wide').click()
await w('.choice').first().waitFor()
check('reinicia con transcripción limpia', (await texts('.msg.bot')).length === 2)
await w('.choice:has-text("Horarios")').click()
await w('.primary.wide').waitFor()
const finalMsgs = await texts('.msg.bot')
check('falla del servicio + cierre en un turno', finalMsgs.some(t => t.includes('problema')) && finalMsgs.at(-1).includes('Gracias'))

// --- 4. Restaurar tras recargar ---
await w('.primary.wide').click()
await w('.choice').first().waitFor()
const idBefore = await page.evaluate(k => JSON.parse(sessionStorage.getItem('korus_chat:' + k)).conversationId, SITE_KEY)
await page.reload()
await w('.bubble').click()
await w('.notice').waitFor()
check('tras F5 restaura la misma conversación', (await page.evaluate(k => JSON.parse(sessionStorage.getItem('korus_chat:' + k)).conversationId, SITE_KEY)) === idBefore)
check('historial local restaurado + aviso', (await texts('.msg.bot')).length === 2 && (await w('.notice').innerText()) === 'Conversación restaurada.')
check('prompt vigente por GET (sin duplicar mensajes)', (await texts('.choice')).length === 2)

// --- 5. Terminar conversación por el usuario ---
await w('.head-btn:has-text("Terminar")').click()
await w('.primary.wide').waitFor()
check('terminar → ENDED/USER', await page.evaluate(() => window.__events.filter(e => e.type === 'ended').at(-1)?.detail?.reason === 'USER'))

// --- 6. Idempotencia: la red falla en el primer intento, reintento con el mismo turnId ---
await w('.primary.wide').click()
await w('.choice').first().waitFor()
turnIds.length = 0
let dropped = false
await page.route('**/turns', route => { if (!dropped) { dropped = true; route.abort() } else route.continue() })
await w('.choice:has-text("Reactivar")').click()
await w('.error').waitFor()
check('fallo de red → error con Reintentar', (await w('.error').innerText()).includes('conexión') && (await w('.error .link').innerText()) === 'Reintentar')
check('tras el error las opciones vuelven a estar habilitadas', (await w('.choice:disabled').count()) === 0)
await page.screenshot({ path: OUT + '/03-retry.png' })
await w('.error .link').click()
await w('.primary.wide').waitFor()
check('reintento usa el MISMO turnId', turnIds.length === 2 && turnIds[0] === turnIds[1], turnIds.join(' / '))
check('y la conversación avanza', (await texts('.msg.bot')).at(-1).includes('inicia sesion'))
await page.unroute('**/turns')

// --- 7. getToken se llama en cada petición ---
const calls = await page.evaluate(() => window.__tokenCalls)
check('getToken invocado en cada llamada (GET, end, start, turno, reintento)', calls === 5, String(calls))

// --- 8. Origen no registrado → fatal, sin reintentos ---
await page.goto(`http://localhost:5176/host.html?siteKey=${SITE_KEY}&open=1`)
await w('.fatal').waitFor()
check('origen ajeno → "no disponible" y sin entrada', (await w('.fatal-text').innerText()).includes('no está disponible') && (await w('.input').count()) === 0)
check('evento error con código', await page.evaluate(() => window.__events.some(e => e.type === 'error' && e.detail?.code === 'forbidden_origin')))
await page.screenshot({ path: OUT + '/04-forbidden.png' })

// --- 9. Site key inválida → fatal. El 401 del gateway llega sin cabeceras CORS,
// así que el navegador lo bloquea y se clasifica como forbidden_origin; para el
// usuario es el mismo "no disponible". (Anotado para back.)
await page.goto(`${HOST}/host.html?siteKey=kor_site_nope&open=1`)
await w('.fatal').waitFor()
check('site key inválida → fatal "no disponible"', await page.evaluate(() => window.__events.some(e => ['unauthorized', 'forbidden_origin'].includes(e.detail?.code))))

// --- 10. Modo page ---
await page.goto(`${HOST}/host.html?siteKey=${SITE_KEY}&mode=page`)
await w('.choice').first().waitFor()
const box = await w('.panel').boundingBox()
check('modo page ocupa la ventana, sin burbuja', box.width === 1100 && box.height === 800 && (await w('.bubble').count()) === 0)
await page.screenshot({ path: OUT + '/05-page.png' })

console.log(`\n${failed ? failed + ' fallos' : 'todo en verde'} · errores de página: ${errors.length ? errors.join(' | ') : 'ninguno'}`)
await browser.close(); s1.close(); s2.close()
process.exit(failed ? 1 : 0)
