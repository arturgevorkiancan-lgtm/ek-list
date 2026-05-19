import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertCircle, CheckCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)
const MAX_TOASTS = 3
const AUTO_DISMISS_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const t = timersRef.current.get(id)
    if (t) {
      clearTimeout(t)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = crypto.randomUUID()
      setToasts((prev) => {
        const next = [...prev, { id, message, type }]
        while (next.length > MAX_TOASTS) {
          const removed = next.shift()
          if (removed) {
            const t = timersRef.current.get(removed.id)
            if (t) {
              clearTimeout(t)
              timersRef.current.delete(removed.id)
            }
          }
        }
        return next
      })
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS)
      timersRef.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const onToast = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type?: ToastType }>)
        .detail
      showToast(message, type ?? 'success')
    }
    window.addEventListener('checklist:toast', onToast)
    return () => window.removeEventListener('checklist:toast', onToast)
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[min(100%,20rem)]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg text-sm text-white min-h-[44px] ${
                toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center opacity-80 hover:opacity-100 -mr-2"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
