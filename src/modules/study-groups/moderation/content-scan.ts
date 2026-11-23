/** Análise automática de texto: determinista, sem serviços externos. Devolve risco 0–1 e categorias. */
const PROFANITY = ['merda', 'porra', 'caralho', 'puta', 'foda', 'fodase', 'idiota', 'imbecil', 'cabrao', 'otario', 'estupido', 'retardado'];

const normalize = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const THRESHOLDS = { low: 0.7, medium: 0.4, high: 0.2 } as const;

export function scoreText(text: string): { score: number; categories: string[]; matches: number } {
  const cats = new Set<string>();
  let score = 0, matches = 0;
  const flag = (cat: string, w: number, n = 1) => { cats.add(cat); score += w; matches += n; };

  const links = (text.match(/https?:\/\/\S+|www\.\S+/gi) ?? []).length;
  if (links >= 6) flag('spam', 0.8, links); else if (links >= 3) flag('spam', 0.5, links);

  if (/(.)\1{9,}/s.test(text)) flag('spam', 0.4);
  const words = normalize(text).match(/\p{L}{3,}/gu) ?? [];
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  if (words.length >= 8 && Math.max(...freq.values()) >= Math.max(5, words.length * 0.5)) flag('spam', 0.4);

  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length >= 20 && letters.filter((c) => c !== c.toLowerCase()).length / letters.length > 0.7) flag('shouting', 0.3);

  const bad = words.filter((w) => PROFANITY.includes(w)).length;
  if (bad) flag('profanity', Math.min(1, bad * 0.4), bad);

  return { score: Math.min(1, Math.round(score * 100) / 100), categories: [...cats], matches };
}
