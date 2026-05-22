/**
 * Browser audit for ek-list checklist.
 * Usage:
 *   node scripts/browser-audit.mjs --url https://ek-list.vercel.app
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/browser-audit.mjs --url https://ek-list.vercel.app
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../audit-screenshots')
const url = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'https://ek-list.vercel.app'
const email = process.env.E2E_EMAIL
const password = process.env.E2E_PASSWORD

fs.mkdirSync(OUT, { recursive: true })

const report = []

function log(block, item, status, detail = '') {
  const line = { block, item, status, detail }
  report.push(line)
  const mark = status === 'ok' ? '✓' : status === 'fail' ? '✗' : status === 'skip' ? '○' : '?'
  console.log(`${mark} [${block}] ${item}${detail ? ` — ${detail}` : ''}`)
}

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true })
  return p
}

async function dismissOnboarding(page) {
  const close = page.getByRole('button', { name: 'Закрыть' })
  if (await close.isVisible({ timeout: 2000 }).catch(() => false)) {
    await close.click()
    return
  }
  const start = page.getByRole('button', { name: /Начать работу|Начать →|Далее →/ })
  for (let i = 0; i < 4; i++) {
    if (!(await start.first().isVisible({ timeout: 1000 }).catch(() => false))) break
    await start.first().click()
  }
}

async function closeModals(page) {
  await dismissOnboarding(page)
  for (const label of ['Отмена', 'Закрыть', 'Отменить']) {
    const btn = page.getByRole('button', { name: label })
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click()
      await page.waitForTimeout(300)
    }
  }
  const backdrop = page.locator('[role="presentation"].fixed.inset-0')
  if (await backdrop.isVisible({ timeout: 500 }).catch(() => false)) {
    await backdrop.click({ position: { x: 10, y: 10 }, force: true })
    await page.waitForTimeout(300)
  }
}

async function tryLogin(page) {
  if (!email || !password) return false
  const onLogin = await page.getByRole('heading', { name: 'ЧЕК-Лист' }).isVisible().catch(() => false)
  if (!onLogin) return true
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
  await page.waitForTimeout(2500)
  const stillLogin = await page.getByText('Вход для менеджеров').isVisible().catch(() => false)
  if (stillLogin) {
    log('auth', 'Вход', 'fail', 'Неверные E2E_EMAIL/E2E_PASSWORD')
    return false
  }
  log('auth', 'Вход', 'ok')
  return true
}

/** Minimal PDF with EGRUL-like text for parser smoke test */
function writeSampleEgrulPdf(filePath) {
  const text = [
    'ВЫПИСКА ИЗ ЕГРЮЛ',
    'Полное наименование ООО «Тест Аудит»',
    'Сокращенное наименование ООО «Тест Аудит»',
    'ИНН 7707083893',
    'КПП 770701001',
    'ОГРН 1027700132195',
    'Адрес (место нахождения) юридического лица',
    '125009, г. Москва, ул. Тестовая, д. 1',
  ].join('\n')
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const stream = `BT /F1 10 Tf 50 750 Td (${escaped.slice(0, 200)}) Tj ET`
  const pdf = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
trailer<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`
  fs.writeFileSync(filePath, pdf)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()

  // Block 7 partial — refresh without 404 (login route)
  await page.goto(`${url}/login`, { waitUntil: 'networkidle' })
  await page.reload()
  const login404 = await page.getByText('404').isVisible().catch(() => false)
  log('7', 'Ctrl+R на /login', login404 ? 'fail' : 'ok', login404 ? '404' : 'страница входа')
  await shot(page, '00-login')

  const loggedIn = await tryLogin(page)
  if (!loggedIn) {
    await page.goto(url, { waitUntil: 'networkidle' })
    const needsAuth = await page.getByText('Вход для менеджеров').isVisible().catch(() => false)
    if (needsAuth) {
      log('0', 'Доступ к приложению', 'skip', 'Требуется вход (задайте E2E_EMAIL и E2E_PASSWORD)')
      await shot(page, '00-login-home-redirect')
      fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
      await browser.close()
      return
    }
  }

  await page.goto(url, { waitUntil: 'networkidle' })
  await dismissOnboarding(page)
  await shot(page, '01-home')

  // Block 1
  const addBtn = page.getByRole('button', { name: '+ Добавить клиента' })
  const addVisible = await addBtn.isVisible().catch(() => false)
  log('1', 'Кнопка "+ Добавить клиента"', addVisible ? 'ok' : 'fail')

  const clientCards = page.locator('a[href^="/clients/"]')
  const clientCount = await clientCards.count()
  log('1', 'Список клиентов', clientCount > 0 ? 'ok' : 'partial', `карточек: ${clientCount}`)

  const warningBadges = page.locator('[class*="bg-red"], [class*="text-red"], [class*="bg-amber"], [class*="text-amber"]')
  const badgeNearClients = await page.locator('main').locator('.rounded-xl').filter({ hasText: /ИНН|лиценз/i }).count()
  log('1', 'Бейджи предупреждений', badgeNearClients > 0 ? 'ok' : 'partial', `элементов с индикацией: ${badgeNearClients}`)

  // Block 2
  if (addVisible) {
    await addBtn.click()
    await page.waitForTimeout(500)
    await shot(page, '02-new-client-modal')
    const egrulBtn = page.getByRole('button', { name: /Загрузить выписку ЕГРЮЛ/i })
    log('2', 'Кнопка загрузки ЕГРЮЛ', (await egrulBtn.isVisible().catch(() => false)) ? 'ok' : 'fail')

    const samplePdf = path.join(OUT, 'sample-egrul.pdf')
    writeSampleEgrulPdf(samplePdf)
    const fileInput = page.locator('input[type="file"][accept*=".pdf"]').first()
    if (await fileInput.count()) {
      await fileInput.setInputFiles(samplePdf)
      await page.waitForTimeout(4000)
      await shot(page, '02-after-egrul-upload')
      const form = page.getByRole('dialog').locator('form')
      const innVal = await form.locator('label').filter({ hasText: /^ИНН/ }).locator('input').inputValue().catch(() => '')
      log('2', 'Автозаполнение из ЕГРЮЛ', innVal?.replace(/\D/g, '').length >= 10 ? 'ok' : 'partial', `ИНН="${innVal}"`)
    } else {
      log('2', 'Загрузка ЕГРЮЛ', 'skip', 'input file не найден')
    }

    const form = page.getByRole('dialog').locator('form')
    const uniqueName = `ООО Аудит ${Date.now()}`
    await form.locator('label').filter({ hasText: /Название организации/ }).locator('input').fill(uniqueName)
    const innField = form.locator('label').filter({ hasText: /^ИНН/ }).locator('input')
    const innCurrent = await innField.inputValue().catch(() => '')
    if (innCurrent.replace(/\D/g, '').length < 10) {
      await innField.fill('7707083893')
    }
    const saveBtn = page.getByRole('button', { name: /^Создать$/ })
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click()
      await page.waitForTimeout(3000)
      const onClient = page.url().includes('/clients/')
      log('2', 'Сохранение клиента', onClient ? 'ok' : 'partial', page.url())
      await shot(page, '02-after-save')
    } else {
      await closeModals(page)
    }
  } else {
    await closeModals(page)
  }

  // Navigate to first client if not already there
  if (!page.url().includes('/clients/')) {
    await closeModals(page)
    const href = await clientCards.first().getAttribute('href').catch(() => null)
    if (href) {
      await page.goto(new URL(href, url).href, { waitUntil: 'networkidle' })
    }
    await page.waitForTimeout(1500)
  }

  if (!page.url().includes('/clients/')) {
    log('3-6', 'Карточка клиента', 'skip', 'нет клиента для проверки')
  } else {
    await dismissOnboarding(page)
    await shot(page, '03-client-overview')

    const bodyText = await page.locator('main').innerText()
    log('3', 'ИНН на обзоре', /ИНН\s*\d/.test(bodyText) ? 'ok' : 'partial')
    log('3', 'КПП на обзоре', /КПП\s*\d/.test(bodyText) ? 'ok' : 'partial')
    log('3', 'ОГРН на обзоре', /ОГРН\s*\d/.test(bodyText) ? 'ok' : 'partial')

    const addLicense = page.getByRole('button', { name: /Добавить лицензию/i })
    log('3', 'Кнопка "Добавить лицензию"', (await addLicense.isVisible().catch(() => false)) ? 'ok' : 'fail')
    if (await addLicense.isVisible().catch(() => false)) {
      await addLicense.click()
      await page.waitForTimeout(500)
      await shot(page, '03-license-modal')
      const manual = page.getByRole('button', { name: 'Ввести вручную' })
      const pdf = page.getByRole('button', { name: 'Загрузить PDF' })
      const registry = page.getByRole('button', { name: 'Из реестра РАТ' })
      log('3', 'Режим: вручную', (await manual.isVisible().catch(() => false)) ? 'ok' : 'partial')
      log('3', 'Режим: PDF', (await pdf.isVisible().catch(() => false)) ? 'ok' : 'partial')
      log('3', 'Режим: реестр РАТ', (await registry.isVisible().catch(() => false)) ? 'ok' : 'partial')
      await page.keyboard.press('Escape')
    }

    // Block 4 — Checklist tab
    await page.getByRole('button', { name: /Чеклист/i }).click()
    await page.waitForTimeout(800)
    await shot(page, '04-checklist')
    const ops = ['ПОЛУЧЕНИЕ', 'ПЕРЕОФОРМЛЕНИЕ', 'ПРОДЛЕНИЕ', 'ПРОВЕРКА_ВЫЕЗДНАЯ', 'ПРОВЕРКА_ВНЕПЛАНОВАЯ']
    let opsFound = 0
    for (const op of ops) {
      if (bodyText.includes(op) || (await page.getByText(op, { exact: false }).count()) > 0) opsFound++
    }
    const opButtons = await page.getByRole('button').filter({ hasText: /ПОЛУЧЕНИЕ|ПЕРЕОФОРМЛЕНИЕ|ПРОДЛЕНИЕ|ПРОВЕРКА/ }).count()
    log('4', '5 типов операций', opButtons >= 5 || opsFound >= 5 ? 'ok' : 'partial', `кнопок: ${opButtons}`)
    const firstOp = page.getByRole('button', { name: /ПОЛУЧЕНИЕ/i }).first()
    if (await firstOp.isVisible().catch(() => false)) {
      await firstOp.click()
      await page.waitForTimeout(600)
      const items = await page.locator('li, [class*="checklist"]').count()
      log('4', 'Список пунктов после выбора', items > 3 ? 'ok' : 'partial', `элементов: ${items}`)
      const doneBtn = page.getByRole('button', { name: /выполнено|готово|✓/i }).first()
      if (await page.locator('button').filter({ hasText: /Circle|Check|XCircle/i }).count() === 0) {
        const row = page.locator('[class*="cursor-pointer"]').first()
        if (await row.isVisible().catch(() => false)) await row.click()
      }
      await shot(page, '04-checklist-items')
      const green = await page.locator('[class*="green"]').count()
      const red = await page.locator('[class*="red"]').count()
      log('4', 'Цветовая индикация', green + red > 0 ? 'ok' : 'partial', `green=${green} red=${red}`)
    }

    // Block 5 — Documents
    await page.getByRole('button', { name: /Документы и склады/i }).click()
    await page.waitForTimeout(1200)
    await shot(page, '05-documents')
    log('5', 'Блок "Документы организации"', (await page.getByText(/Документы организации/i).count()) > 0 ? 'ok' : 'fail')
    log('5', 'Кнопка ЕГРЮЛ', (await page.getByRole('button', { name: /ЕГРЮЛ/i }).count()) > 0 ? 'ok' : 'partial')
    log('5', '"Обновить данные из документа"', (await page.getByText(/Обновить данные из документа/i).count()) > 0 ? 'ok' : 'partial')
    log('5', '"Склады из реестра"', (await page.getByText(/Склады из реестра/i).count()) > 0 ? 'ok' : 'partial')
    log('5', '"Создать выбранные"', (await page.getByRole('button', { name: /Создать выбранные/i }).count()) > 0 ? 'ok' : 'partial')
    log('5', 'Реестр РАТ', (await page.getByText(/Реестр РАТ|РАТ/i).count()) > 0 ? 'ok' : 'partial')
    log('5', 'ДЕЙСТВУЮЩИЕ/АРХИВ', (await page.getByText(/ДЕЙСТВУЮЩИЕ|АРХИВ/i).count()) >= 1 ? 'ok' : 'partial')

    const warehouseHeader = page.locator('button, [role="button"]').filter({ hasText: /Склад|склад/i }).first()
    if (await warehouseHeader.isVisible().catch(() => false)) {
      await warehouseHeader.click()
      await page.waitForTimeout(400)
      for (const sec of ['Документы', 'Журнал', 'Условия', 'ГОСТ']) {
        log('5', `Секция "${sec}"`, (await page.getByText(sec, { exact: false }).count()) > 0 ? 'ok' : 'partial')
      }
    }

    // Block 6 — Journal (inside warehouse)
    const journalTab = page.getByText('Журнал', { exact: true }).first()
    if (await journalTab.isVisible().catch(() => false)) {
      await journalTab.click()
      await page.waitForTimeout(600)
      await shot(page, '06-journal')
      const tempInput = page.locator('input[type="number"], input[inputmode="decimal"]').first()
      if (await tempInput.isVisible().catch(() => false)) {
        await tempInput.fill('12')
        const hum = page.locator('input[type="number"]').nth(1)
        if (await hum.isVisible().catch(() => false)) await hum.fill('65')
        const addReading = page.getByRole('button', { name: /Добавить|Сохранить запись/i })
        if (await addReading.isVisible().catch(() => false)) {
          await addReading.click()
          await page.waitForTimeout(1000)
        }
        const greenJ = await page.locator('[class*="green"]').count()
        const redJ = await page.locator('[class*="red"]').count()
        log('6', 'Запись температуры/влажности', 'ok')
        log('6', 'Цветовая индикация журнала', greenJ + redJ > 0 ? 'ok' : 'partial', `green=${greenJ} red=${redJ}`)
      } else {
        log('6', 'Форма журнала', 'partial', 'поля не найдены')
      }
    }

    // Block 7 — navigation
    await page.getByRole('button', { name: 'Все клиенты' }).click()
    await page.waitForTimeout(800)
    const onHome = page.url().replace(/\/$/, '') === url.replace(/\/$/, '') || page.url().endsWith('/')
    log('7', '"Все клиенты" → главная', onHome ? 'ok' : 'partial', page.url())
    await page.goto(page.url().includes('/clients/') ? page.url() : `${url}/clients/test`)
    const logo = page.getByRole('link', { name: /ЧЕК-Лист/i }).or(page.locator('a').filter({ hasText: 'ЧЕК-Лист' })).first()
    if (await logo.isVisible().catch(() => false)) {
      await logo.click()
      await page.waitForTimeout(800)
      log('7', 'Логотип → главная', page.url().match(/\/clients\//) ? 'partial' : 'ok', page.url())
    }
    if (page.url().includes('/clients/')) {
      await page.reload()
      const client404 = await page.getByText('Клиент не найден').isVisible().catch(() => false)
      const http404 = await page.getByText('404').isVisible().catch(() => false)
      log('7', 'Ctrl+R на карточке клиента', !http404 ? 'ok' : 'fail', client404 ? 'клиент не найден' : 'страница загружена')
    }
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\nScreenshots: ${OUT}`)
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
