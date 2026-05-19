import type { NavigateFunction } from 'react-router-dom'

export const SKIP_LAST_CLIENT_KEY = 'checklist_skip_last_client'

/** Navigate to the clients list without auto-opening the last visited client. */
export function navigateToClientsList(navigate: NavigateFunction) {
  try {
    sessionStorage.setItem(SKIP_LAST_CLIENT_KEY, '1')
  } catch {
    /* ignore */
  }
  navigate('/')
}
