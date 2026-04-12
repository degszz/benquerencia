import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : authError.message,
      );
    } else {
      onLogin();
    }
  }

  return (
    <div className="min-h-screen bg-ben-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo + título */}
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-white">Portería Benquerencia</h1>
          <p className="text-sm text-ben-400 mt-1">Ingresá con tu cuenta para continuar</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-950/40 border border-red-800/50 p-3 text-sm text-red-300 text-center">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-ben-400 mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="guardia@benquerencia.com"
              className="w-full rounded-lg bg-ben-800 border border-ben-700 px-4 py-3
                         text-sm text-white placeholder-ben-400/50 outline-none
                         focus:border-ben-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-ben-400 mb-1.5 block">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-lg bg-ben-800 border border-ben-700 px-4 py-3
                         text-sm text-white placeholder-ben-400/50 outline-none
                         focus:border-ben-400 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-ben-600 hover:bg-ben-500 disabled:opacity-50
                       text-white font-semibold py-3 text-sm transition-colors"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
