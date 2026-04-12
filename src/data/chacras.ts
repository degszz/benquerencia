// Este archivo ya no se usa — las chacras se cargan desde Supabase.
// Se mantiene solo como referencia del formato de datos.

export interface Chacra {
  numero: string;
  nombre1: string;
  nombre2?: string;
  nombre3?: string;
  telefono: string;
  telefonoAlternativo?: string;
}

export const chacras: Chacra[] = [];
