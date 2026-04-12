import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import Tesseract from 'tesseract.js';
import { supabase, type ChacraDB } from '@/lib/supabase';

// ── Fuzzy match nombre → chacra ───────────────────────────────────────────────

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Obtener todos los nombres no vacíos de una chacra
function nombresDeChacra(c: ChacraDB): string[] {
  return [c.nombre1, c.nombre2, c.nombre3].filter(Boolean);
}

function buscarChacraParaNombre(nombre: string, chacras: ChacraDB[]): ChacraDB | null {
  if (!nombre || nombre.length < 3 || !chacras.length) return null;
  const palabras = normalizar(nombre).split(/\s+/).filter(Boolean);
  let mejor: ChacraDB | null = null;
  let mejorScore = 0;
  for (const c of chacras) {
    // Buscar en los 3 nombres y quedarse con el mejor score
    for (const n of nombresDeChacra(c)) {
      const palabrasC = normalizar(n).split(/\s+/).filter(Boolean);
      const coinciden = palabras.filter(p => palabrasC.some(pc => pc.includes(p) || p.includes(pc))).length;
      const score = coinciden / Math.max(palabras.length, palabrasC.length);
      if (score > mejorScore && score >= 0.4) { mejorScore = score; mejor = c; }
    }
  }
  return mejor;
}

// ── Courier detection ────────────────────────────────────────────────────────

interface Courier {
  nombre: string;
  emoji: string;
}

function detectarCourier(codigo: string): Courier {
  const c = codigo.trim().toUpperCase();
  if (/^(MLA|MLB|MLC|MLM|MX|MP)\d+/.test(c))  return { nombre: 'MercadoLibre',     emoji: '🟡' };
  if (/^RA\d{9}AR$/.test(c))                   return { nombre: 'Correo Argentino', emoji: '🔵' };
  if (/^AND/.test(c))                           return { nombre: 'Andreani',         emoji: '🟠' };
  if (/^OCA/.test(c))                           return { nombre: 'OCA',              emoji: '🔵' };
  if (/^\d{20}$/.test(c) || /^\d{9}$/.test(c)) return { nombre: 'Andreani',         emoji: '🟠' };
  if (/^\d{12}$/.test(c))                       return { nombre: 'OCA',              emoji: '🔵' };
  if (/^\d{10}$/.test(c))                       return { nombre: 'DHL',              emoji: '🔴' };
  if (/^\d{13,19}$/.test(c))                    return { nombre: 'MercadoLibre',     emoji: '🟡' };
  return { nombre: 'Courier', emoji: '📦' };
}

function generarMensaje(propietario: string, courier: string, tracking: string) {
  return (
    `📦 *Benquerencia Farm Club — Portería*\n\n` +
    `Hola ${propietario}, tiene un paquete esperándolo.\n\n` +
    `*Empresa:* ${courier}\n` +
    `*N° de seguimiento:* ${tracking}\n\n` +
    `Puede pasar a retirarlo cuando guste.`
  );
}

// ── Componente ───────────────────────────────────────────────────────────────

type Vista = 'inicio' | 'escaneando' | 'foto' | 'resultado';

export default function PorteriaScanner() {
  const [vista, setVista]                     = useState<Vista>('inicio');
  const [tracking, setTracking]               = useState('');
  const [courier, setCourier]                 = useState<Courier | null>(null);
  const [chacras, setChacras]                 = useState<ChacraDB[]>([]);
  const [cargandoChacras, setCargandoChacras] = useState(true);
  const [busqueda, setBusqueda]               = useState('');
  const [seleccionada, setSeleccionada]       = useState<ChacraDB | null>(null);
  const [inputManual, setInputManual]         = useState('');
  const [nombreManual, setNombreManual]       = useState('');
  const [telefonoManual, setTelefonoManual]   = useState('');
  const [error, setError]                     = useState('');
  const [copiado, setCopiado]                 = useState(false);
  const [paqueteId, setPaqueteId]             = useState<string | null>(null);
  const [enviado, setEnviado]                 = useState(false);

  // Estado para modo foto (captura + OCR + barcode)
  const [procesandoFoto, setProcesandoFoto]   = useState(false);
  const [fotoPreview, setFotoPreview]         = useState<string | null>(null);
  const [ocrTexto, setOcrTexto]               = useState('');
  const [ocrNombre, setOcrNombre]             = useState('');

  const videoRef     = useRef<HTMLVideoElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const controlsRef  = useRef<{ stop: () => void } | null>(null);

  // ── Cargar chacras desde Supabase al montar ──────────────────────────────
  useEffect(() => {
    (async () => {
      setCargandoChacras(true);
      const { data } = await supabase
        .from('chacras')
        .select('id,numero,nombre1,nombre2,nombre3,telefono,telefono_alternativo')
        .eq('activo', true)
        .order('numero', { ascending: true });
      setChacras((data as ChacraDB[]) ?? []);
      setCargandoChacras(false);
    })();
  }, []);

  // ── Filtrado de chacras por búsqueda ─────────────────────────────────────
  const charasFiltradas = busqueda.trim()
    ? chacras.filter(
        (c) =>
          c.numero.includes(busqueda) ||
          nombresDeChacra(c).some(n => normalizar(n).includes(normalizar(busqueda))),
      )
    : chacras;

  // ── Auto-match cuando el guardia escribe nombre manual ───────────────────
  useEffect(() => {
    if (!nombreManual || chacras.length === 0) return;
    const match = buscarChacraParaNombre(nombreManual, chacras);
    if (match) {
      setSeleccionada(match);
    }
  }, [nombreManual, chacras]);

  // ── Iniciar cámara ────────────────────────────────────────────────────────
  const iniciarScanner = useCallback(() => {
    setError('');
    setVista('escaneando');
  }, []);

  useEffect(() => {
    if (vista !== 'escaneando') return;
    const reader = new BrowserMultiFormatReader();
    let active = true;

    (async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!active || !result) return;
            const codigo = result.getText();
            setTracking(codigo);
            setCourier(detectarCourier(codigo));
            setSeleccionada(null);
            setBusqueda('');
            setNombreManual('');
            setVista('resultado');
          },
        );
        controlsRef.current = controls;
      } catch (e: any) {
        if (active) {
          setError(
            e?.name === 'NotAllowedError'
              ? 'Permiso de cámara denegado. Habilitalo en la configuración del navegador.'
              : 'No se pudo acceder a la cámara.',
          );
          setVista('inicio');
        }
      }
    })();

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [vista]);

  function detener() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setVista('inicio');
  }

  function reiniciar() {
    setTracking(''); setCourier(null); setSeleccionada(null);
    setBusqueda(''); setInputManual(''); setNombreManual('');
    setTelefonoManual(''); setPaqueteId(null); setEnviado(false);
    setFotoPreview(null); setOcrTexto(''); setOcrNombre('');
    setProcesandoFoto(false);
    setVista('inicio');
  }

  function procesarManual() {
    const cod = inputManual.trim();
    if (!cod) return;
    setTracking(cod);
    setCourier(detectarCourier(cod));
    setSeleccionada(null);
    setBusqueda('');
    setNombreManual('');
    setVista('resultado');
  }

  // ── Procesar foto: barcode + OCR en paralelo ────────────────────────────
  async function procesarFoto(file: File) {
    setProcesandoFoto(true);
    setError('');
    setVista('foto');

    // Preview de la foto
    const url = URL.createObjectURL(file);
    setFotoPreview(url);

    // Crear imagen para zxing
    const img = new Image();
    img.src = url;
    await new Promise<void>((res) => { img.onload = () => res(); });

    // Dibujar en canvas para procesamiento
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    let codigoDetectado = '';
    let textoOCR = '';

    // Ejecutar barcode + OCR en paralelo
    const [barcodeResult, ocrResult] = await Promise.allSettled([
      // Barcode detection
      (async () => {
        try {
          const reader = new BrowserMultiFormatReader();
          const result = await reader.decodeFromCanvas(canvas);
          return result?.getText() ?? '';
        } catch {
          return '';
        }
      })(),
      // OCR
      (async () => {
        try {
          const { data } = await Tesseract.recognize(canvas, 'spa+eng', {});
          return data.text;
        } catch {
          return '';
        }
      })(),
    ]);

    if (barcodeResult.status === 'fulfilled') codigoDetectado = barcodeResult.value;
    if (ocrResult.status === 'fulfilled') textoOCR = ocrResult.value;

    setOcrTexto(textoOCR);

    // Extraer nombre del texto OCR
    const nombreExtraido = extraerNombreDeOCR(textoOCR);
    setOcrNombre(nombreExtraido);

    if (codigoDetectado) {
      setTracking(codigoDetectado);
      setCourier(detectarCourier(codigoDetectado));
    }

    // Auto-match nombre contra chacras
    if (nombreExtraido && chacras.length > 0) {
      const match = buscarChacraParaNombre(nombreExtraido, chacras);
      if (match) setSeleccionada(match);
    }

    setProcesandoFoto(false);

    // Si encontró código → ir directo a resultado
    if (codigoDetectado) {
      setVista('resultado');
    }
  }

  // Extraer nombre probable del texto OCR de una etiqueta de paquete
  function extraerNombreDeOCR(texto: string): string {
    if (!texto) return '';
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

    // Buscar líneas que parezcan nombres (2+ palabras capitalizadas, sin números excesivos)
    const candidatos: string[] = [];
    const patronesIgnorar = /^\d{4,}|^(calle|av\.|avenida|piso|dto|depto|cp |c\.p\.|provincia|localidad|ciudad|tel|email|ref|n°|nro)/i;
    const patronNombre = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+$/;

    for (const linea of lineas) {
      // Ignorar líneas con muchos números (tracking, CP, tel)
      const digitCount = (linea.match(/\d/g) || []).length;
      if (digitCount > linea.length * 0.4) continue;
      if (patronesIgnorar.test(linea)) continue;

      // Limpiar puntuación extrema
      const limpia = linea.replace(/[^\w\sáéíóúñÁÉÍÓÚÑ]/g, '').trim();
      if (limpia.length < 4 || limpia.split(/\s+/).length < 2) continue;

      // Priorizar líneas que parecen nombres propios
      if (patronNombre.test(limpia)) {
        candidatos.unshift(limpia);
      } else {
        candidatos.push(limpia);
      }
    }

    // Buscar "DESTINATARIO:", "PARA:", "A:" como hints
    for (const linea of lineas) {
      const match = linea.match(/(?:destinatario|para|nombre|a)\s*[:]\s*(.+)/i);
      if (match) {
        const nombre = match[1].trim();
        if (nombre.length > 3) return nombre;
      }
    }

    return candidatos[0] ?? '';
  }

  function confirmarFoto() {
    // Si no se detectó barcode en la foto, permitir ir a resultado con lo que hay
    if (!tracking && ocrNombre) {
      setNombreManual(ocrNombre);
    }
    setVista('resultado');
  }

  // ── Guardar paquete en Supabase y enviar WhatsApp ─────────────────────────
  async function enviarWhatsApp() {
    if (!courier) return;
    const nombre = seleccionada?.nombre1 ?? nombreManual.trim();
    const tel    = (seleccionada?.telefono ?? telefonoManual).replace(/\D/g, '');
    const chacraId     = seleccionada?.id ?? null;
    const chacraNro    = seleccionada?.numero ?? null;

    if (!nombre || !tel) return;

    // Registrar en Supabase
    const { data } = await supabase
      .from('paquetes')
      .insert({
        tracking,
        courier: courier.nombre,
        chacra_id: chacraId,
        chacra_numero: chacraNro,
        propietario: nombre,
        estado: 'notificado',
        notificado_at: new Date().toISOString(),
        origen: 'web',
      })
      .select('id')
      .single();

    if (data?.id) setPaqueteId(data.id);

    const msg = generarMensaje(nombre, courier.nombre, tracking);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    setEnviado(true);
  }

  async function marcarRetirado() {
    if (!paqueteId) return;
    await supabase.from('paquetes').update({
      estado: 'retirado',
      retirado_at: new Date().toISOString(),
    }).eq('id', paqueteId);
    reiniciar();
  }

  async function copiarTracking() {
    try { await navigator.clipboard.writeText(tracking); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch {}
  }

  const puedeEnviar = !!courier && (
    seleccionada != null ||
    (nombreManual.trim().length > 2 && telefonoManual.replace(/\D/g, '').length >= 10)
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-ben-900 text-white pb-10">

      {/* Header */}
      <div className="bg-ben-800 border-b border-ben-700 px-4 py-3 flex items-center gap-3">
        <span className="text-2xl">📦</span>
        <div>
          <h1 className="font-bold text-sm">Portería</h1>
          <p className="text-xs text-ben-400">Estancia Benquerencia</p>
        </div>
        {!cargandoChacras && chacras.length > 0 && (
          <span className="ml-auto text-xs text-ben-400">{chacras.length} chacras</span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">

        {/* ── INICIO ── */}
        {vista === 'inicio' && (
          <>
            {error && (
              <div className="rounded-xl bg-red-950/40 border border-red-800/50 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={iniciarScanner}
                className="rounded-2xl bg-ben-600 hover:bg-ben-500 active:bg-ben-700
                           transition-colors p-5 flex flex-col items-center gap-2"
              >
                <span className="text-4xl">📷</span>
                <span className="font-bold text-sm">Escanear código</span>
                <span className="text-ben-300 text-xs">Cámara en vivo</span>
              </button>

              <button
                onClick={() => fotoInputRef.current?.click()}
                className="rounded-2xl bg-amber-700 hover:bg-amber-600 active:bg-amber-800
                           transition-colors p-5 flex flex-col items-center gap-2"
              >
                <span className="text-4xl">🔍</span>
                <span className="font-bold text-sm">Sacar foto</span>
                <span className="text-amber-300 text-xs">Código + nombre</span>
              </button>
            </div>

            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) procesarFoto(file);
                e.target.value = '';
              }}
            />

            {/* Input manual */}
            <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-3">
              <p className="text-xs text-ben-400 font-semibold uppercase tracking-wide">
                O ingresá el código manualmente
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputManual}
                  onChange={(e) => setInputManual(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && procesarManual()}
                  placeholder="Ej: MLA1234567890"
                  className="flex-1 rounded-lg bg-ben-900 border border-ben-700 px-3 py-2.5
                             text-sm text-white placeholder-ben-400/60 outline-none
                             focus:border-ben-400 transition-colors"
                />
                <button
                  onClick={procesarManual}
                  disabled={!inputManual.trim()}
                  className="rounded-lg bg-ben-600 hover:bg-ben-500 disabled:opacity-40
                             px-4 py-2.5 text-sm font-semibold transition-colors"
                >
                  OK
                </button>
              </div>
            </div>

            {/* Estado chacras */}
            <div className="rounded-xl bg-ben-800/50 border border-ben-700 p-4">
              {cargandoChacras ? (
                <p className="text-sm text-ben-400 text-center">Cargando propietarios…</p>
              ) : chacras.length === 0 ? (
                <p className="text-sm text-ben-400 text-center">
                  Sin propietarios cargados aún — el guardia puede ingresar el nombre a mano.
                </p>
              ) : (
                <p className="text-sm text-ben-300 text-center">
                  ✅ {chacras.length} propietarios disponibles para búsqueda rápida
                </p>
              )}
            </div>
          </>
        )}

        {/* ── ESCANEANDO ── */}
        {vista === 'escaneando' && (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-32 border-2 border-ben-400 rounded-xl opacity-80" />
              </div>
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="bg-black/60 text-ben-300 text-xs px-3 py-1 rounded-full">
                  Apuntá al código de barras
                </span>
              </div>
            </div>
            <button
              onClick={detener}
              className="w-full rounded-xl border border-ben-700 bg-ben-800
                         hover:bg-ben-700 transition-colors py-3 text-sm font-semibold"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ── FOTO (procesando / resultado parcial) ── */}
        {vista === 'foto' && (
          <div className="space-y-4">
            {fotoPreview && (
              <div className="rounded-2xl overflow-hidden border border-ben-700">
                <img src={fotoPreview} alt="Foto del paquete" className="w-full" />
              </div>
            )}

            {procesandoFoto ? (
              <div className="rounded-xl bg-ben-800 border border-ben-700 p-6 text-center space-y-3">
                <div className="w-8 h-8 mx-auto rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <p className="text-sm text-ben-300">Analizando foto…</p>
                <p className="text-xs text-ben-400">Buscando código de barras y nombre del destinatario</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Resultado barcode */}
                <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-2">
                  <p className="text-xs text-ben-400 font-semibold uppercase tracking-wide">Código de barras</p>
                  {tracking ? (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{courier?.emoji}</span>
                      <span className="font-mono text-sm text-white truncate">{tracking}</span>
                      <span className="text-xs text-ben-400">({courier?.nombre})</span>
                    </div>
                  ) : (
                    <p className="text-sm text-amber-400">No se detectó — podés ingresarlo abajo</p>
                  )}
                </div>

                {/* Resultado OCR nombre */}
                <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-2">
                  <p className="text-xs text-ben-400 font-semibold uppercase tracking-wide">Nombre detectado</p>
                  {ocrNombre ? (
                    <div>
                      <p className="text-sm text-white font-semibold">{ocrNombre}</p>
                      {seleccionada && (
                        <p className="text-xs text-emerald-400 mt-1">
                          ✅ Coincide con Chacra #{seleccionada.numero} — {seleccionada.nombre1}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-400">No se detectó nombre — podés buscarlo manualmente</p>
                  )}
                </div>

                {/* Texto OCR completo (colapsable) */}
                {ocrTexto && (
                  <details className="rounded-xl bg-ben-800/50 border border-ben-700 p-3">
                    <summary className="text-xs text-ben-400 cursor-pointer">Ver texto completo detectado</summary>
                    <pre className="mt-2 text-xs text-ben-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {ocrTexto}
                    </pre>
                  </details>
                )}

                {/* Si no se detectó barcode, input manual */}
                {!tracking && (
                  <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-2">
                    <p className="text-xs text-ben-400">Ingresá el código manualmente</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inputManual}
                        onChange={(e) => setInputManual(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const cod = inputManual.trim();
                            if (cod) { setTracking(cod); setCourier(detectarCourier(cod)); }
                          }
                        }}
                        placeholder="Ej: MLA1234567890"
                        className="flex-1 rounded-lg bg-ben-900 border border-ben-700 px-3 py-2.5
                                   text-sm text-white placeholder-ben-400/60 outline-none
                                   focus:border-ben-400 transition-colors"
                      />
                      <button
                        onClick={() => {
                          const cod = inputManual.trim();
                          if (cod) { setTracking(cod); setCourier(detectarCourier(cod)); }
                        }}
                        disabled={!inputManual.trim()}
                        className="rounded-lg bg-ben-600 hover:bg-ben-500 disabled:opacity-40
                                   px-4 py-2.5 text-sm font-semibold transition-colors"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={reiniciar}
                    className="flex-1 rounded-xl border border-ben-700 bg-ben-800
                               hover:bg-ben-700 transition-colors py-3 text-sm font-semibold"
                  >
                    ↩ Cancelar
                  </button>
                  <button
                    onClick={confirmarFoto}
                    disabled={!tracking && !inputManual.trim()}
                    className="flex-1 rounded-xl bg-ben-600 hover:bg-ben-500 disabled:opacity-40
                               transition-colors py-3 text-sm font-semibold"
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RESULTADO ── */}
        {vista === 'resultado' && courier && (
          <div className="space-y-4">

            {/* Código detectado */}
            <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{courier.emoji}</span>
                <div>
                  <p className="font-bold">{courier.nombre}</p>
                  <p className="text-xs text-ben-400">Courier detectado</p>
                </div>
              </div>
              <button
                onClick={copiarTracking}
                className="w-full rounded-lg bg-ben-900 border border-ben-700 hover:border-ben-400
                           px-3 py-2.5 font-mono text-sm text-ben-300 text-left
                           transition-colors flex items-center justify-between gap-2"
              >
                <span className="truncate">{tracking}</span>
                <span className="text-xs shrink-0">{copiado ? '✅ Copiado' : '📋 Copiar'}</span>
              </button>
            </div>

            {/* Buscar propietario */}
            <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-3">
              <p className="text-xs text-ben-400 font-semibold uppercase tracking-wide">
                {seleccionada ? '✅ Propietario encontrado' : '¿Para quién es el paquete?'}
              </p>

              {cargandoChacras ? (
                <p className="text-sm text-ben-400 text-center py-3">Cargando propietarios…</p>
              ) : chacras.length > 0 ? (
                /* Con chacras cargadas: búsqueda por nombre o número */
                <>
                  {seleccionada && (
                    <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/50 p-3 flex items-center gap-3">
                      <span className="text-emerald-400 text-lg">✅</span>
                      <div>
                        <p className="font-bold text-white">{seleccionada.nombre1}</p>
                        <p className="text-xs text-ben-400">Chacra #{seleccionada.numero} · {seleccionada.telefono}</p>
                      </div>
                      <button
                        onClick={() => { setSeleccionada(null); setBusqueda(''); }}
                        className="ml-auto text-xs text-ben-400 hover:text-white"
                      >
                        Cambiar
                      </button>
                    </div>
                  )}

                  {!seleccionada && (
                    <>
                      <p className="text-xs text-ben-300">
                        Escribí el nombre que figura en la etiqueta del paquete
                      </p>
                      <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Nombre o número de chacra…"
                        autoFocus
                        className="w-full rounded-lg bg-ben-900 border border-ben-700 px-3 py-2.5
                                   text-sm text-white placeholder-ben-400/60 outline-none
                                   focus:border-ben-400 transition-colors"
                      />
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {charasFiltradas.slice(0, 20).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSeleccionada(c)}
                            className="w-full rounded-lg px-3 py-2.5 text-left text-sm
                              bg-ben-900 border border-ben-700 hover:border-ben-500
                              transition-colors flex items-center gap-3"
                          >
                            <span className="font-bold text-ben-300 w-8 shrink-0">#{c.numero}</span>
                            <div>
                              <span className="text-white">{c.nombre1}</span>
                              {(c.nombre2 || c.nombre3) && (
                                <span className="text-ben-400 text-xs ml-2">
                                  {[c.nombre2, c.nombre3].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                        {busqueda.trim() && charasFiltradas.length === 0 && (
                          <p className="text-center text-ben-400 text-sm py-3">
                            Sin resultados — probá con otro nombre
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* Sin chacras: formulario manual */
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-ben-400 mb-1.5 block">
                      Nombre del destinatario <span className="text-ben-300">(leelo de la etiqueta)</span>
                    </label>
                    <input
                      type="text"
                      value={nombreManual}
                      onChange={(e) => setNombreManual(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      autoFocus
                      className="w-full rounded-lg bg-ben-900 border border-ben-700 px-3 py-2.5
                                 text-sm text-white placeholder-ben-400/60 outline-none
                                 focus:border-ben-400 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ben-400 mb-1.5 block">WhatsApp del propietario</label>
                    <input
                      type="tel"
                      value={telefonoManual}
                      onChange={(e) => setTelefonoManual(e.target.value)}
                      placeholder="5491112345678"
                      className="w-full rounded-lg bg-ben-900 border border-ben-700 px-3 py-2.5
                                 text-sm text-white placeholder-ben-400/60 outline-none
                                 focus:border-ben-400 transition-colors"
                    />
                    <p className="text-xs text-ben-400/60 mt-1">54 + código de área + número</p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview + WhatsApp */}
            {puedeEnviar && !enviado && (
              <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-3">
                <div className="rounded-lg bg-ben-900 border border-ben-700 p-3 text-xs text-ben-300 whitespace-pre-wrap">
                  {generarMensaje(
                    seleccionada?.nombre1 ?? nombreManual.trim(),
                    courier.nombre,
                    tracking,
                  )}
                </div>
                <button
                  onClick={enviarWhatsApp}
                  className="w-full rounded-xl py-4 font-bold text-base flex items-center
                             justify-center gap-3 bg-[#25D366] hover:bg-[#20c05b] text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.563 4.14 1.547 5.874L.057 23.743a.5.5 0 00.614.614l5.869-1.49A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.651-.502-5.176-1.381l-.371-.22-3.835.974.993-3.835-.242-.38A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
                  Notificar por WhatsApp
                </button>
              </div>
            )}

            {/* Enviado: botón marcar retirado */}
            {enviado && (
              <div className="rounded-xl bg-ben-800 border border-ben-700 p-4 space-y-3 text-center">
                <p className="text-sm text-ben-300">✅ Notificación enviada</p>
                <button
                  onClick={marcarRetirado}
                  className="w-full rounded-xl border border-ben-700 bg-emerald-700/30
                             hover:bg-emerald-700/50 transition-colors py-3 text-sm font-semibold text-emerald-300"
                >
                  ✔ Marcar como retirado y listo
                </button>
              </div>
            )}

            <button
              onClick={reiniciar}
              className="w-full rounded-xl border border-ben-700 bg-ben-800
                         hover:bg-ben-700 transition-colors py-3 text-sm font-semibold"
            >
              ↩ Nuevo paquete
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
