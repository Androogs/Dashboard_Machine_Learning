export default async function run(page, ui) {
  const FILE = 'C:/Users/USUARIO/Desktop/ASI VAMOS suzuki nov 17.xlsx'
  const steps = []
  await page.getByText('Opción A').first().click().catch((e) => steps.push('optA fail ' + e))
  await page.waitForTimeout(800)
  const s1 = await ui.snapshot()
  steps.push('after OptA:\n' + s1.slice(0, 2500))
  const confirm = page.getByRole('button', { name: /entendido|cargar documento|continuar/i }).first()
  if (await confirm.count()) { await confirm.click().catch(() => {}); steps.push('confirm clicked') }
  await page.waitForTimeout(800)
  const input = page.locator('input[type=file]').first()
  try { await input.waitFor({ state: 'attached', timeout: 10000 }); steps.push('input attached') } catch (e) { steps.push('input MISSING') }
  await input.setInputFiles(FILE).catch((e) => steps.push('setInputFiles fail ' + e))
  await page.waitForTimeout(1500)
  const s2 = await ui.snapshot()
  steps.push('after file:\n' + s2.slice(0, 2500))
  return { steps }
}
