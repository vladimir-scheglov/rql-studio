import YAML, {
  isMap,
  isScalar,
  Scalar,
  YAMLMap,
  YAMLSeq,
  Document,
} from "yaml";
import type { DataRule } from "./types";

export function replaceRuleInYaml(
  originalYaml: string,
  ruleId: string,
  newRule: DataRule | null,
): { yaml: string; found: boolean } {
  let doc: Document.Parsed;
  try {
    doc = YAML.parseDocument(originalYaml);
  } catch {
    return { yaml: originalYaml, found: false };
  }

  if (!isMap(doc.contents)) {
    return { yaml: originalYaml, found: false };
  }

  const root = doc.contents as YAMLMap;

  // Ищем блок dataRules
  let dataRulesSeq: YAMLSeq | null = null;
  for (const pair of root.items) {
    if (
      isScalar(pair.key) &&
      (pair.key as Scalar).value === "dataRules" &&
      pair.value instanceof YAMLSeq
    ) {
      dataRulesSeq = pair.value;
      break;
    }
  }

  // Если блока нет — создаём
  if (!dataRulesSeq) {
    if (!newRule) return { yaml: originalYaml, found: false };

    const seq = new YAMLSeq();
    seq.add(buildRuleNode(newRule) as any);
    root.set("dataRules", seq);
    return { yaml: doc.toString(), found: true };
  }

  // Ищем правило по id
  let found = false;
  for (let i = 0; i < dataRulesSeq.items.length; i++) {
    const item = dataRulesSeq.items[i];
    if (!(item instanceof YAMLMap)) continue;

    const idPair = item.items.find(
      (p) => isScalar(p.key) && (p.key as Scalar).value === "id",
    );
    if (!idPair || !isScalar(idPair.value)) continue;
    if ((idPair.value as Scalar).value !== ruleId) continue;

    found = true;

    if (newRule) {
      dataRulesSeq.items[i] = buildRuleNode(newRule) as any;
    } else {
      dataRulesSeq.items.splice(i, 1);
    }
    break;
  }

  return { yaml: doc.toString(), found };
}

export function removeRuleFromYaml(
  originalYaml: string,
  ruleId: string,
): { yaml: string; found: boolean } {
  return replaceRuleInYaml(originalYaml, ruleId, null);
}

// =========================================================================

function buildRuleNode(rule: DataRule): YAMLMap {
  const map = new YAMLMap();

  map.set("id", rule.id);
  if (rule.name) map.set("name", rule.name);
  if (rule.target) map.set("target", rule.target);
  if (rule.entity) map.set("entity", rule.entity);

  // condition: !rql ...
  const condition = extractConditionText(rule.condition);
  if (condition === "true" || condition === "") {
    map.set("condition", true);
  } else {
    const scalar = new Scalar(condition);
    (scalar as any).tag = "!rql";
    if (condition.length > 100 || condition.includes("\n")) {
      scalar.type = Scalar.BLOCK_LITERAL;
    }
    map.set("condition", scalar);
  }

  if (rule.message) map.set("message", rule.message);
  if (rule.help) map.set("help", rule.help);

  // rule
  if (rule.rule) {
    const ruleMap = new YAMLMap();

    if (rule.rule.effect) {
      ruleMap.set("effect", rule.rule.effect);
    }

    const attrs = rule.rule.attributes ?? [];
    if (attrs.length > 0) {
      const attrsSeq = new YAMLSeq();
      for (const a of attrs) {
        const attrMap = new YAMLMap();
        attrMap.set("attribute", a.attribute);

        const anyA = a as any;
        if (anyA.value !== undefined) {
          attrMap.set("value", anyA.value);
        }
        if (anyA.expression) {
          const exprScalar = new Scalar(anyA.expression);
          (exprScalar as any).tag = "!rql";
          attrMap.set("expression", exprScalar);
        }
        if (anyA.constraint) {
          const cScalar = new Scalar(anyA.constraint);
          (cScalar as any).tag = "!rql";
          attrMap.set("constraint", cScalar);
        }
        if (a.message) attrMap.set("message", a.message);
        if (a.help) attrMap.set("help", a.help);

        attrsSeq.add(attrMap as any);
      }
      ruleMap.set("attributes", attrsSeq);
    }

    map.set("rule", ruleMap);
  }

  return map;
}

function extractConditionText(condition: unknown): string {
  if (condition === true) return "true";
  if (typeof condition === "string") {
    return condition.replace(/^!rql\s*/i, "").trim();
  }
  if (condition && typeof condition === "object") {
    const c = condition as any;
    if (typeof c.value === "string") return c.value.trim();
    if (c.value === true) return "true";
  }
  return "";
}
