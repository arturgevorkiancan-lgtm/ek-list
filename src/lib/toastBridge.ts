export type ToastBridgeType = 'success' | 'error'

export function emitToast(message: string, type: ToastBridgeType = 'success'): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('checklist:toast', { detail: { message, type } }),
  )
}
