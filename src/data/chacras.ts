// ─────────────────────────────────────────────────────────────
// LISTA DE CHACRAS — actualizar con los datos reales
// Formato teléfono: código de país + área + número (sin + ni espacios)
// Ejemplo Argentina: 5491112345678  (54 + 911 + 12345678)
// ─────────────────────────────────────────────────────────────

export interface Chacra {
  numero: string;
  propietario: string;
  telefono: string;
  telefonoAlternativo?: string;
}

export const chacras: Chacra[] = [
  // { numero: '1', propietario: 'Juan Pérez',     telefono: '5491112345678' },
  // { numero: '2', propietario: 'María García',   telefono: '5491123456789' },
  // Agregá acá todas las chacras con sus propietarios
];
