import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'

interface LoginPageProps {
  redirectTo?: string
}

export function LoginPage({ redirectTo = '/' }: LoginPageProps) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (signInError) {
      setError(signInError)
      return
    }
    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl bg-white shadow-lg border border-slate-200 p-8">
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-600 text-white mb-4"
            aria-hidden
          >
            <ClipboardList className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">ЧЕК-Лист</h1>
          <p className="mt-1 text-sm text-slate-500 text-center">
            Вход для менеджеров
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="you@company.ru"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
              Пароль
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] rounded-lg bg-brand-600 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-slate-400">
          Учётные записи создаются администратором в Supabase
        </p>
      </div>
    </div>
  )
}
