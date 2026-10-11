import YAML from "yaml";
import { z } from "zod";
import type { DomainSchema } from "./types";

const EntitySchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    inherits: z.string().optional(),
    attributes: z.array(z.any()).optional(),
    sorting: z.array(z.any()).optional(),
    // ... остальное не валидируем строго на старте
  })
  .passthrough();

const DomainSchemaZ = z
  .object({
    id: z.string(),
    type: z.literal("domain"),
    version: z.string(),
    name: z.string(),
    entities: z.array(EntitySchema).optional(),
    dataTypes: z.array(z.any()).optional(),
    linkages: z.array(z.any()).optional(),
    // ...
  })
  .passthrough();

export interface ParseResult {
  domains: DomainSchema[];
  errors: { file: string; message: string }[];
}

export function parseSchemaFiles(
  files: { name: string; content: string }[],
): ParseResult {
  const domains: DomainSchema[] = [];
  const errors: ParseResult["errors"] = [];

  for (const file of files) {
    try {
      const docs = YAML.parseAllDocuments(file.content);
      for (const doc of docs) {
        if (doc.warnings) {
          (doc.warnings as any) = doc.warnings.filter(
            (w: any) =>
              !(
                w.message?.toLowerCase().includes("!rql") &&
                w.message?.toLowerCase().includes("unresolved tag")
              ),
          );
        }
        if (doc.errors) {
          (doc.errors as any) = doc.errors.filter(
            (e: any) =>
              !(
                e.message?.toLowerCase().includes("!rql") &&
                e.message?.toLowerCase().includes("unresolved tag")
              ),
          );
        }
      }
      
      for (const doc of docs) {
        const raw = doc.toJSON();
        if (!raw) continue;

        const parsed = DomainSchemaZ.safeParse(raw);
        if (!parsed.success) {
          errors.push({
            file: file.name,
            message: parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
          });
          continue;
        }
        domains.push(parsed.data as DomainSchema);
      }
    } catch (e: any) {
      errors.push({ file: file.name, message: e.message });
    }
  }

  return { domains, errors };
}
