import es from './es.json';
import en from './en.json';

// Añadir un idioma = añadir su JSON aquí + fila en la tabla `languages`.
export const dictionaries = { es, en } as const;
export type Lang = keyof typeof dictionaries;
export const langs = Object.keys(dictionaries) as Lang[];
export const defaultLang: Lang = 'es';

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && v in dictionaries;

export function useT(lang: Lang) {
  const dict = dictionaries[lang];
  return (key: string): string => {
    const v = key.split('.').reduce<any>((o, k) => o?.[k], dict);
    return typeof v === 'string' ? v : key;
  };
}

/** Ruta equivalente en otro idioma (para hreflang y selector). */
export function localizePath(path: string, from: Lang, to: Lang): string {
  const fromR = dictionaries[from].routes as Record<string, string>;
  const toR = dictionaries[to].routes as Record<string, string>;
  const parts = path.split('/').filter(Boolean);
  parts[0] = to;
  return '/' + parts.map((p, i) => {
    if (i === 0) return p;
    const key = Object.keys(fromR).find((k) => fromR[k] === p);
    return key ? toR[key] : p;
  }).join('/') + (parts.length === 1 ? '/' : '');
}
