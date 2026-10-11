import type {
  SymbolTable,
  ResolvedEntity,
  ResolvedAttribute,
} from "../schema/symbol-table";
import { parseFqid } from "../schema/fqid";

export interface GenerateOptions {
  /** Всегда возвращать null для Reference */
  nullReferences?: boolean;
  /** Максимальное количество элементов в массиве */
  maxArrayItems?: number;
}

const DEFAULTS: GenerateOptions = {
  nullReferences: true,
  maxArrayItems: 1,
};

// =========================================================================

export function generateFakeObject(
  entity: ResolvedEntity,
  table: SymbolTable,
  options: GenerateOptions = {},
): Record<string, any> {
  const opts = { ...DEFAULTS, ...options };
  const obj: Record<string, any> = {};

  for (const attr of entity.attributes.values()) {
    obj[attr.id] = generateValue(attr, table, entity, opts);
  }

  return obj;
}

// =========================================================================

function generateValue(
  attr: ResolvedAttribute,
  table: SymbolTable,
  owner: ResolvedEntity,
  opts: GenerateOptions,
): any {
  const dataType = attr.dataType;

  // Пользовательские типы — Enum / Workflow / Table
  const resolved = resolveCustomType(dataType, owner.domain, table);

  if (resolved?.kind === "enum") {
    const values = resolved.values ?? [];
    if (values.length === 0) return null;
    return pickRandom(values).id;
  }

  if (resolved?.kind === "workflow") {
    const values = resolved.values ?? [];
    if (values.length === 0) return null;
    // Первый статус — обычно initial
    return values[0].id;
  }

  if (resolved?.kind === "table") {
    return [];
  }

  // Встроенные типы
  switch (dataType) {
    case "String":
      return generateString(attr);
    case "Text":
      return generateString(attr, true);
    case "Integer":
      return generateNumber(attr, "int");
    case "Decimal":
      return generateNumber(attr, "decimal");
    case "Float":
      return generateNumber(attr, "float");
    case "Bool":
      return Math.random() > 0.5;
    case "Timestamp":
      return new Date().toISOString();
    case "Date":
      return new Date().toISOString().slice(0, 10);
    case "Time":
      return "12:00:00";
    case "Uuid":
      return crypto.randomUUID();
    case "MAC":
      return "00:11:22:33:44:55";
    case "IpAddress":
      return "192.0.2.1";
    case "CIDR":
      return "192.0.2.0/24";
    case "URL":
      return "https://example.com";
    case "Identifier":
      return generateIdentifier(attr);
    case "Reference":
      return opts.nullReferences ? null : null;
    case "Array":
      return generateArray(attr, table, owner, opts);
    case "Attachment":
      return null;
    case "Counter":
      return null;
    case "Calculation":
      return 0;
    default:
      return null;
  }
}

// =========================================================================

function resolveCustomType(
  dataType: string,
  domain: string,
  table: SymbolTable,
): { kind: "enum" | "workflow" | "table"; values?: any[] } | null {
  const parts = parseFqid(dataType);
  const typeId = parts.entity;
  const typeDomain = parts.domain ?? domain;
  const fqid = `${typeDomain}/${typeId}`;

  if (table.enums.has(fqid) || table.enums.has(typeId)) {
    return {
      kind: "enum",
      values: table.enums.get(fqid) ?? table.enums.get(typeId),
    };
  }
  if (table.workflows.has(fqid) || table.workflows.has(typeId)) {
    return {
      kind: "workflow",
      values: table.workflows.get(fqid) ?? table.workflows.get(typeId),
    };
  }
  const dt = table.dataTypes.get(fqid) ?? table.dataTypes.get(typeId);
  if (dt?.dataType === "Table") {
    return { kind: "table" };
  }
  return null;
}

function generateString(attr: ResolvedAttribute, long = false): string {
  // Учитываем length-constraint
  const lengthConstraint = attr.constraints?.find((c) => c.kind === "length");
  const min = lengthConstraint?.min ?? (long ? 20 : 5);
  const max = lengthConstraint?.max ?? (long ? 100 : 30);

  // Если есть regexp — генерируем по нему
  const regexpConstraint = attr.constraints?.find((c) => c.kind === "regexp");
  if (regexpConstraint?.regexp) {
    const generated = generateFromRegexp(regexpConstraint.regexp);
    if (generated) return generated;
  }

  const base = long
    ? "Демонстрационный текст для симуляции правил данных"
    : "Sample";
  if (base.length >= min && base.length <= max) return base;
  return base.slice(0, max).padEnd(min, "x");
}

function generateNumber(
  attr: ResolvedAttribute,
  kind: "int" | "decimal" | "float",
): number | string {
  const c = attr.constraints?.find((x) => x.kind === "range");
  const min = c?.min ?? 0;
  const max = c?.max ?? 100;

  if (kind === "int") return Math.floor(min + Math.random() * (max - min));
  if (kind === "decimal") return (min + Math.random() * (max - min)).toFixed(1);
  return Number((min + Math.random() * (max - min)).toFixed(3));
}

function generateIdentifier(attr: ResolvedAttribute): string {
  const prefix = attr.defaultPrefix ?? "ID";
  const n = Math.floor(Math.random() * 9999) + 1;
  return `${prefix}-${n.toString().padStart(4, "0")}`;
}

function generateArray(
  attr: ResolvedAttribute,
  table: SymbolTable,
  owner: ResolvedEntity,
  opts: GenerateOptions,
): any[] {
  const item = attr.item;
  if (!item) return [];

  const count = Math.min(opts.maxArrayItems ?? 1, 3);
  const result: any[] = [];

  for (let i = 0; i < count; i++) {
    const fakeAttr: ResolvedAttribute = {
      id: `${attr.id}_item`,
      dataType: item.dataType,
      entity: item.entity,
      constraints: item.constraints,
      fqid: `${owner.fqid}.${attr.id}_item`,
      ownerFqid: owner.fqid,
    };
    result.push(generateValue(fakeAttr, table, owner, opts));
  }
  return result;
}

// =========================================================================

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Генерация строки по простому регулярному выражению */
function generateFromRegexp(regexp: string): string | null {
  try {
    // Убираем якоря
    let re = regexp.replace(/^\^/, "").replace(/\$$/, "");

    // Простейший парсер: последовательность классов символов и квантификаторов
    // ^[a-z][a-z0-9_.-]{2,31}$ → 'abc123'
    let result = "";
    let i = 0;
    while (i < re.length) {
      let charClass = "abcdefghijklmnopqrstuvwxyz0123456789";
      let isClass = false;

      if (re[i] === "[") {
        const end = re.indexOf("]", i);
        if (end === -1) return null;
        charClass = expandCharClass(re.slice(i + 1, end));
        isClass = true;
        i = end + 1;
      } else if (re[i] === "\\") {
        i++;
        charClass = re[i] ?? "";
        i++;
      } else {
        result += re[i];
        i++;
        continue;
      }

      // Квантификатор
      let min = 1;
      let max = 1;
      if (re[i] === "{") {
        const end = re.indexOf("}", i);
        if (end === -1) return null;
        const [mn, mx] = re
          .slice(i + 1, end)
          .split(",")
          .map((s) => parseInt(s, 10));
        min = mn || 0;
        max = mx || mn || 0;
        i = end + 1;
      } else if (re[i] === "+") {
        min = 1;
        max = 3;
        i++;
      } else if (re[i] === "*") {
        min = 0;
        max = 3;
        i++;
      } else if (re[i] === "?") {
        min = 0;
        max = 1;
        i++;
      }

      const len = Math.floor(min + Math.random() * (max - min + 1));
      for (let j = 0; j < len; j++) {
        result += charClass[Math.floor(Math.random() * charClass.length)];
      }
    }

    return result;
  } catch {
    return null;
  }
}

function expandCharClass(cls: string): string {
  // a-z → abcdefghijklmnopqrstuvwxyz
  // a-z0-9_ → abcdefghijklmnopqrstuvwxyz0123456789_
  let result = "";
  let i = 0;
  while (i < cls.length) {
    if (i + 2 < cls.length && cls[i + 1] === "-") {
      const start = cls.charCodeAt(i);
      const end = cls.charCodeAt(i + 2);
      for (let c = start; c <= end; c++) result += String.fromCharCode(c);
      i += 3;
    } else {
      result += cls[i];
      i++;
    }
  }
  return result;
}
