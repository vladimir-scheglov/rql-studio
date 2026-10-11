import { parseSchemaFiles } from "./parse";

/**
 * Находит файл из списка rawFiles, из которого распарсился
 * домен с указанным id.
 */
export function findFileForDomain(
  domainId: string,
  rawFiles: { name: string; content: string }[],
): { name: string; content: string } | null {
  for (const file of rawFiles) {
    try {
      const { domains } = parseSchemaFiles([file]);
      if (domains.some((d) => d.id === domainId)) {
        return file;
      }
    } catch {
      continue;
    }
  }
  return null;
}
