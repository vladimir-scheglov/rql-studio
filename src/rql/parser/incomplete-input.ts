export function isIncompleteInput(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed === "" || trimmed === "!rql") return true;

  if (/[,(+\-*/=<>!]\s*$/.test(text)) return true;

  if (
    /\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|AS|AND|OR|NOT|IN|IS|LIKE|BETWEEN)\s*$/i.test(
      text,
    )
  ) {
    return true;
  }

  if (/@[\w]*\.?\s*$/.test(trimmed)) return true;

  if (
    countChar(text, "(") !== countChar(text, ")") ||
    countChar(text, "[") !== countChar(text, "]") ||
    countChar(text, "'") % 2 !== 0
  ) {
    return true;
  }

  return false;
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === ch) n++;
  return n;
}
