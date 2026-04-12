import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginForm from './LoginForm';
import PorteriaScanner from './PorteriaScanner';

export default function PorteriaApp() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null); // null = cargando

  useEffect(() => {
    // Verificar sesión existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAutenticado(!!session);
    });

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAutenticado(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cargando sesión
  if (autenticado === null) {
    return (
      <div className="min-h-screen bg-ben-900 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-ben-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  // No autenticado → login
  if (!autenticado) {
    return <LoginForm onLogin={() => setAutenticado(true)} />;
  }

  // Autenticado → scanner con botón logout
  return (
    <div className="relative">
      <PorteriaScanner />
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          setAutenticado(false);
        }}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-ben-800 border border-ben-700
                   hover:bg-ben-700 text-ben-400 hover:text-white text-xs px-3 py-1.5
                   transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
