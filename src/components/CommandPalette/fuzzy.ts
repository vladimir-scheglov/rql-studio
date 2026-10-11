/**
 * Простой subsequence-matching с оценкой:
 *   "inc" матчится с "Incident", "Incident_Ioc", "rule_incident_id"
 * Возвращает score: чем меньше, тем лучше.
 * Возвращает -1, если не матчится.
 */
export function fuzzyScore(needle: string, haystack: string): number {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let ni = 0;
  let hi = 0;
  let score = 0;
  let lastMatch = -1;

  while (ni < n.length && hi < h.length) {
    if (n[ni] === h[hi]) {
      // Бонус за совпадение подряд
      if (lastMatch === hi - 1) score -= 1;
      // Штраф за пропуски
      score += hi - lastMatch - 1;
      lastMatch = hi;
      ni++;
    }
    hi++;
  }

  if (ni < n.length) return -1;

  // Штраф за общую длину строки
  score += Math.floor(h.length / 4);
  return score;
}

export interface FuzzyMatch {
  score: number;
  /** Позиции совпавших символов — для подсветки */
  matchedIndices: number[];
}

export function fuzzyMatch(
  needle: string,
  haystack: string,
): FuzzyMatch | null {
  const score = fuzzyScore(needle, haystack);
  if (score === -1) return null;

  const matchedIndices: number[] = [];
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let ni = 0;

  for (let hi = 0; hi < h.length && ni < n.length; hi++) {
    if (n[ni] === h[hi]) {
      matchedIndices.push(hi);
      ni++;
    }
  }

  return { score, matchedIndices };
}
