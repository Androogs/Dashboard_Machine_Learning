export default async function run(page, ui) {
  const FILE = 'C:/Users/USUARIO/Desktop/ASI VAMOS suzuki nov 17.xlsx'
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.getByText('Opción A').first().click().catch(() => {})
  await page.waitForTimeout(600)
  const confirm = page.getByRole('button', { name: /entendido|cargar documento|continuar/i }).first()
  if (await confirm.count()) await confirm.click().catch(() => {})
  await page.waitForTimeout(600)
  const input = page.locator('input[type=file]').first()
  await input.waitFor({ state: 'attached', timeout: 15000 })
  await input.setInputFiles(FILE)
  await page.waitForTimeout(800)
  const gen = page.getByRole('button', { name: /generar dashboard|empezar an/i }).first()
  if (await gen.count()) await gen.click().catch(() => {})
  // esperar hasta que la pantalla de análisis desaparezca (máx 5 min)
  const t0 = Date.now()
  let state = ''
  while (Date.now() - t0 < 300000) {
    state = await page.evaluate(() => document.body.innerText.slice(0, 400))
    if (!/analizando tu informaci/i.test(state)) break
    await page.waitForTimeout(5000)
  }
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'C:/Users/USUARIO/Desktop/av-state.png', fullPage: false })
  const snap = await ui.snapshot()
  return { state: await page.evaluate(() => document.body.innerText.slice(0, 900)), snap: snap.slice(0, 3000), errors }
}
