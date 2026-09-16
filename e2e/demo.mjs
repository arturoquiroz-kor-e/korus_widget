// Recorrido del bot `demo` (capture text/email/number con reintentos, list
// paginada, decision, opciones, POST) contra korus_chat con CHAT_CONNECTOR=http.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { serve } from './server.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SITE_KEY = process.env.DEMO_SITE_KEY || 'kor_site_t3cOJ5c9fFbbSVywFtM-Bg'
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
const lastBot = async () => (await w('.msg.bot').allInnerTexts()).at(-1).trim()
const inputs = []
page.on('request', r => { if (r.url().includes('/turns')) inputs.push(JSON.parse(r.postData()).input) })
async function type(text) {
  await w('.textform input').fill(text)
  await w('.textform button').click()
  await page.waitForFunction(() => !document.querySelector('korus-chat').shadowRoot.querySelector('.typing'))
}

await page.goto(`http://localhost:5177/host.html?siteKey=${SITE_KEY}&open=1`)
await w('.textform input').waitFor()

// --- capture text ---
check('prompt text pinta input tipo text', (await w('.textform input').getAttribute('type')) === 'text')
check('Enviar deshabilitado vacío', await w('.textform button').isDisabled())
await type('Ana')
check('nombre aceptado, siguiente prompt interpola {{nombre}}', (await lastBot()).includes('Gracias Ana'))
check('input type=email para dataType email', (await w('.textform input').getAttribute('type')) === 'email')

// --- capture email inválido → reintento, luego válido ---
await type('esto-no-es-correo')
check('email inválido → mensaje del bot y sigue pidiendo', (await w('.textform input').count()) === 1)
await type('ana@demo.test')
check('email aceptado → pide edad con type=number', (await w('.textform input').getAttribute('type')) === 'number')
const stored = await page.evaluate(k => sessionStorage.getItem('korus_chat:' + k), SITE_KEY)
check('el correo (sensitive) va enmascarado en sessionStorage', !stored.includes('ana@demo.test') && stored.includes('••••'))

// --- number fuera de rango → reintento (1) → válido ---
await type('7')
check('edad fuera de rango → reintento', (await w('.textform input').count()) === 1)
await type('30')
await w('.pager').waitFor()

// --- list paginada ---
const p1 = await w('.choice').allInnerTexts()
check('list pinta items de la página 1', p1.length >= 1, p1.join(' | '))
check('Anterior deshabilitado, Siguiente habilitado', (await w('.pager .link').first().isDisabled()) && !(await w('.pager .link').last().isDisabled()))
check('indicador de página con totalPages (no items)', (await w('.pager-info').innerText()) === 'Página 1 de 3', await w('.pager-info').innerText())
await page.screenshot({ path: OUT + '/06-list.png' })
await w('.pager .link').last().click()
await page.waitForFunction(() => document.querySelector('korus-chat').shadowRoot.querySelector('.pager-info')?.textContent.startsWith('Página 2'))
const p2 = await w('.choice').allInnerTexts()
check('Siguiente → página 2 con otros items', p2.join() !== p1.join() && inputs.at(-1).type === 'page' && inputs.at(-1).value === 'next')
await w('.pager .link').first().click()
await page.waitForFunction(() => document.querySelector('korus-chat').shadowRoot.querySelector('.pager-info')?.textContent.startsWith('Página 1'))
check('Anterior → vuelve a la 1 (manda page/prev, no calcula)', inputs.at(-1).value === 'prev' && (await w('.choice').allInnerTexts()).join() === p1.join())
await w('.pager .link').last().click()
await page.waitForFunction(() => document.querySelector('korus-chat').shadowRoot.querySelector('.pager-info')?.textContent.startsWith('Página 2'))
await w('.pager .link').last().click()
await page.waitForFunction(() => document.querySelector('korus-chat').shadowRoot.querySelector('.pager-info')?.textContent.startsWith('Página 3'))
check('en la última, Siguiente deshabilitado', await w('.pager .link').last().isDisabled())

// --- elegir item → decision → option → POST → terminal ---
await w('.choice').first().click()
await page.waitForFunction(() => !document.querySelector('korus-chat').shadowRoot.querySelector('.typing'))
check('elegir item manda option con el value del item', inputs.at(-1).type === 'option')
const after = await w('.choice').allInnerTexts()
check('tras la decisión llega un prompt de opciones', after.length >= 2, after.join(' | '))
// Cualquiera de las dos ramas lleva a opciones; tomamos la primera hasta cerrar
for (let i = 0; i < 4 && (await w('.choice').count()); i++) {
  const labels = await w('.choice').allInnerTexts()
  const pick = labels.find(l => /confirmar|No, gracias/i.test(l)) || labels[0]
  await w(`.choice:has-text("${pick}")`).click()
  await page.waitForFunction(() => !document.querySelector('korus-chat').shadowRoot.querySelector('.typing'))
}
await w('.primary.wide').waitFor()
check('la conversación termina (POST real al mock o cierre)', true, await lastBot())
await page.screenshot({ path: OUT + '/07-demo-end.png' })

console.log(`\n${failed ? failed + ' fallos' : 'todo en verde'} · errores de página: ${errors.length ? errors.join(' | ') : 'ninguno'}`)
await browser.close(); server.close()
process.exit(failed ? 1 : 0)
