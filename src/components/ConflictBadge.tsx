interface ConflictBadgeProps {
  count: number
  onClick: () => void
  className?: string
}

export function ConflictBadge({ count, onClick, className = '' }: ConflictBadgeProps) {
  if (count <= 0) return null

  const label =
    count === 1 ? '1 расхождение' : count < 5 ? `${count} расхождения` : `${count} расхождений`

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 ${className}`}
      title="Открыть окно устранения расхождений"
    >
      <span aria-hidden>⚠️</span>
      {label}
    </button>
  )
}
