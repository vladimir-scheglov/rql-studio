/**
 * Простое форматирование: расставляет отступы по скобкам
 * и переносит ключевые слова на новые строки.
 */
export function formatRql(input: string): string {
  const trimmed = input.trim();
  const hasDirective = /^!rql\b/.test(trimmed);
  const body = hasDirective ? trimmed.replace(/^!rql\b/, "").trim() : trimmed;

  // Переносы перед AND/OR/WHERE/ORDER BY/GROUP BY/HAVING/LIMIT
  const tokens = body
    .replace(/\s+/g, " ")
    .replace(/\s*\b(AND|OR)\b\s*/gi, "\n$1 ")
    .replace(/\s*\b(WHERE|HAVING)\b\s*/gi, "\n$1 ")
    .replace(/\s*\b(GROUP BY)\b\s*/gi, "\n$1 ")
    .replace(/\s*\b(ORDER BY)\b\s*/gi, "\n$1 ")
    .replace(/\s*\b(LIMIT|OFFSET)\b\s*/gi, "\n$1 ");

  // Отступы по круглым скобкам
  const lines = tokens.split("\n");
  let depth = 0;
  const formatted = lines.map((line) => {
    const opens = (line.match(/\(/g) ?? []).length;
    const closes = (line.match(/\)/g) ?? []).length;
    const indent = "  ".repeat(depth);
    depth = Math.max(0, depth + opens - closes);
    return indent + line.trim();
  });

  const result = formatted.join("\n");
  return hasDirective ? `!rql\n${result}` : result;
}
