import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import { format, parseISO } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { ChecklistItem, Client, OperationType } from '../types'
import { OPERATION_LABELS } from '../data/checklistItems'
import RobotoRegular from '../assets/fonts/Roboto-Regular.ttf'
import RobotoBold from '../assets/fonts/Roboto-Bold.ttf'

Font.register({
  family: 'Roboto',
  fonts: [
    { src: RobotoRegular, fontWeight: 'normal' },
    { src: RobotoBold, fontWeight: 'bold' },
  ],
})

const STATUS_DISPLAY: Record<string, { icon: string; label: string }> = {
  done: { icon: '✓', label: 'Готово' },
  in_progress: { icon: '⏳', label: 'В процессе' },
  not_started: { icon: '—', label: 'Не начато' },
  na: { icon: 'N/A', label: 'Н/П' },
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    padding: 40,
    color: '#1e293b',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  headerRow: {
    marginBottom: 4,
    fontSize: 10,
  },
  headerLabel: {
    fontWeight: 'bold',
  },
  table: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    minHeight: 22,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  colNum: { width: '6%', padding: 4 },
  colDoc: { width: '38%', padding: 4 },
  colStatus: { width: '18%', padding: 4 },
  colDue: { width: '14%', padding: 4 },
  colComment: { width: '24%', padding: 4 },
  summary: {
    marginTop: 12,
    fontSize: 10,
    fontWeight: 'bold',
  },
  signatures: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureCol: {
    width: '45%',
  },
  signatureLine: {
    fontSize: 10,
    marginBottom: 8,
  },
  signatureDate: {
    fontSize: 9,
    color: '#64748b',
  },
})

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return format(parseISO(d), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return d
  }
}

export interface PDFReportProps {
  client: Client
  operationType: OperationType
  items: ChecklistItem[]
  reportDate?: Date
}

export function PDFReport({ client, operationType, items, reportDate = new Date() }: PDFReportProps) {
  const sorted = [...items].sort((a, b) => a.block_num - b.block_num || a.item_num - b.item_num)
  const doneCount = sorted.filter((i) => i.status === 'done').length

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>ЧЕК-Лист — Чеклист лицензирования</Text>

        <Text style={styles.headerRow}>
          <Text style={styles.headerLabel}>Организация: </Text>
          {client.name}
        </Text>
        {client.inn ? (
          <Text style={styles.headerRow}>
            <Text style={styles.headerLabel}>ИНН: </Text>
            {client.inn}
          </Text>
        ) : null}
        <Text style={styles.headerRow}>
          <Text style={styles.headerLabel}>Тип операции: </Text>
          {OPERATION_LABELS[operationType]}
        </Text>
        <Text style={styles.headerRow}>
          <Text style={styles.headerLabel}>Дата чеклиста: </Text>
          {format(reportDate, 'dd.MM.yyyy', { locale: ru })}
        </Text>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colNum}>№</Text>
            <Text style={styles.colDoc}>Документ</Text>
            <Text style={styles.colStatus}>Статус</Text>
            <Text style={styles.colDue}>Срок</Text>
            <Text style={styles.colComment}>Комментарий</Text>
          </View>

          {sorted.map((item, index) => {
            const status = STATUS_DISPLAY[item.status] ?? {
              icon: '?',
              label: item.status,
            }
            return (
              <View
                key={item.id}
                style={[styles.tableRow, index % 2 === 1 ? styles.tableRowAlt : {}]}
              >
                <Text style={styles.colNum}>{index + 1}</Text>
                <Text style={styles.colDoc}>{item.title}</Text>
                <Text style={styles.colStatus}>
                  {status.icon} {status.label}
                </Text>
                <Text style={styles.colDue}>{formatDate(item.due_date)}</Text>
                <Text style={styles.colComment}>{item.comment ?? ''}</Text>
              </View>
            )
          })}
        </View>

        <Text style={styles.summary}>
          Готово {doneCount} из {sorted.length} пунктов
        </Text>

        <View style={styles.signatures}>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLine}>Исполнитель: _________________________</Text>
            <Text style={styles.signatureDate}>Дата: __________</Text>
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.signatureLine}>Клиент: _________________________</Text>
            <Text style={styles.signatureDate}>Дата: __________</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

export function getChecklistPdfFilename(clientName: string): string {
  const safe = clientName.replace(/\s+/g, '_')
  return `ek-list_${safe}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
}
