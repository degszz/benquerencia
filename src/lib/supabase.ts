import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wjjomwkjphejtzixog.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indqam9td2pranBoZWp0eml4eG9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDg1MTksImV4cCI6MjA5MTQyNDUxOX0.' +
  'n7vEl9p_3goS9EAON7wB8TFdDv0F2e2ADtgO2-a8VFQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ChacraDB {
  id: string;
  numero: string;
  propietario: string;
  telefono: string;
  telefono_alternativo?: string;
  activo: boolean;
}
