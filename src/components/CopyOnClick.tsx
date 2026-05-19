import type { ReactNode, MouseEvent } from 'react'
import { useToast } from '../context/ToastContext'

interface CopyOnClickProps {
  text: string
  children: ReactNode
  label?: string
}

export function CopyOnClick({ text, children, label }: CopyOnClickProps) {
  const { showToast } = useToast()

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    showToast(label ?? 'Скопировано', 'success', 2000)
  }

  return (
    <span
      onClick={handleCopy}
      className="cursor-pointer hover:opacity-70 transition-opacity"
      style={{ borderBottom: '1px dashed currentColor' }}
      title="Нажмите чтобы скопировать"
    >
      {children}
    </span>
  )
}
