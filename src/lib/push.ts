function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

export type PushPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

export function getPushPermissionState(): PushPermissionState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission as PushPermissionState
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!vapidPublic?.trim()) {
    console.warn('VITE_VAPID_PUBLIC_KEY is not set')
    return null
  }

  const reg = await navigator.serviceWorker.ready

  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublic.trim()) as BufferSource,
  })
  return sub
}

export async function savePushSubscription(
  sub: PushSubscription,
  userId: string,
): Promise<void> {
  const { supabase } = await import('./supabase')
  if (!supabase) throw new Error('Supabase not configured')
  const p256dh = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!p256dh || !auth) throw new Error('Push subscription keys missing')

  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: arrayBufferToBase64(p256dh),
      auth: arrayBufferToBase64(auth),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
}

export async function unsubscribeFromPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    const { supabase } = await import('./supabase')
    if (supabase) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
    await sub.unsubscribe()
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub !== null
}
