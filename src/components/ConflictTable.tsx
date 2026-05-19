import { useMemo } from 'react'
import type { ConflictItem } from '../lib/conflictDetector'
import { getDefaultValue } from '../lib/conflictDetector'

interface ConflictTableProps {
  conflicts: ConflictItem[]
  onResolve: (fieldKey: string, value: string) => void
  selectedByField?: Record<string, string>
  manualFieldKeys?: ReadonlySet<string>
  unresolvedFieldKeys?: ReadonlySet<string>
}

export function ConflictTable({
  conflicts,
  onResolve,
  selectedByField = {},
  manualFieldKeys,
  unresolvedFieldKeys,
}: ConflictTableProps) {
  const count = conflicts.length
  const effectiveSelected = useMemo(() => {
    const map: Record<string, string> = {}
    for (const conflict of conflicts) {
      map[conflict.fieldKey] =
        selectedByField[conflict.fieldKey] ?? getDefaultValue(conflict)
    }
    return map
  }, [conflicts, selectedByField])

  if (count === 0) return null

  const fieldWord = count === 1 ? 'поле' : count < 5 ? 'поля' : 'полей'

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <span aria-hidden>⚠️</span>
        Обнаружены расхождения в документах ({count} {fieldWord})
      </div>

      <div className="overflow-x-auto rounded-md border border-amber-200 bg-white">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr className="border-b border-amber-100 bg-amber-50/80 text-left text-xs font-medium text-slate-600">
              <th className="px-3 py-2 w-[26%]">Поле</th>
              <th className="px-3 py-2 w-[24%]">Источник</th>
              <th className="px-3 py-2">Значение</th>
              <th className="px-3 py-2 w-24 text-center">Использовать</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((conflict) => {
              const selectedValue = effectiveSelected[conflict.fieldKey]
              const isUnresolved = unresolvedFieldKeys?.has(conflict.fieldKey)
              const isManual = manualFieldKeys?.has(conflict.fieldKey)
              const rowCount = conflict.values.length

              return conflict.values.map((row, rowIdx) => {
                const isFirst = rowIdx === 0
                const isSelected = selectedValue === row.value
                const rowUnresolved = isUnresolved && !isManual

                return (
                  <tr
                    key={`${conflict.fieldKey}-${row.sourceName}-${rowIdx}`}
                    className={`border-b border-slate-100 last:border-0 ${
                      rowUnresolved ? 'border-l-4 border-l-red-500' : ''
                    }`}
                  >
                    {isFirst && (
                      <td
                        className="px-3 py-2 align-top font-medium text-slate-800 border-r border-slate-50"
                        rowSpan={rowCount}
                      >
                        {conflict.field}
                        {isManual && (
                          <span className="mt-1 block text-xs font-normal text-slate-500">
                            ✏️ вручную
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 align-top text-slate-600">{row.sourceName}</td>
                    <td className="px-3 py-2 align-top text-slate-800 break-words">
                      {row.value}
                    </td>
                    <td className="px-3 py-2 align-top text-center">
                      <input
                        type="radio"
                        name={conflict.fieldKey}
                        checked={isSelected}
                        onChange={() => onResolve(conflict.fieldKey, row.value)}
                        className="h-4 w-4 text-brand-600"
                        title="Использовать это значение"
                      />
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
