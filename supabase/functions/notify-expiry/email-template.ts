export interface ExpiryEmailData {
  orgName: string
  licenseNumber: string
  expiryDate: string
  daysRemaining: number
  checklistUrl: string
  warningLevel: '6m' | '95d' | '30d'
}

const ACTION_TEXT: Record<ExpiryEmailData['warningLevel'], string> = {
  '6m': 'Рекомендуем начать подготовку документов к продлению лицензии.',
  '95d': 'Необходимо подать заявление на продление в установленный срок (≤95 дней до окончания).',
  '30d': 'Срочно: осталось менее 30 дней. Немедленно инициируйте процедуру продления.',
}

export function buildExpiryEmailHtml(data: ExpiryEmailData): string {
  const action = ACTION_TEXT[data.warningLevel]
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Лицензия — требуется продление</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h1 style="color: #dc2626; font-size: 20px;">⚠️ Лицензия ${escapeHtml(data.orgName)} — требуется продление</h1>
  <p>Уважаемый коллега,</p>
  <p>Напоминаем о приближающемся сроке действия лицензии:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Организация</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(data.orgName)}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Номер лицензии</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(data.licenseNumber)}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Дата окончания</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${escapeHtml(data.expiryDate)}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0; background: #f8fafc;"><strong>Осталось дней</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${data.daysRemaining}</td></tr>
  </table>
  <p><strong>Рекомендуемое действие:</strong> ${escapeHtml(action)}</p>
  <p><a href="${escapeHtml(data.checklistUrl)}" style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Открыть чеклист клиента</a></p>
  <p style="font-size: 12px; color: #64748b; margin-top: 24px;">Письмо отправлено автоматически системой ЧЕК-Лист.</p>
</body>
</html>`
}

export function buildExpiryEmailSubject(orgName: string): string {
  return `⚠️ Лицензия ${orgName} — требуется продление`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
