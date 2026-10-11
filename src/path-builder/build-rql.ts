import type { SymbolTable, ResolvedEntity } from "../schema/symbol-table";
import { resolveEntityFqid } from "../schema/symbol-table";
import type { PathModel, PathStep } from "./types";

interface GeneratorContext {
  table: SymbolTable;
  domain: string;
  /** Карта: entityFqid → выбранный alias */
  entityAliases: Map<string, string>;
  /** Счётчик уникальных имён */
  counter: { n: number };
}

/**
 * Генерирует RQL-запрос для пути.
 *
 * Запрос строится в обратном направлении: сначала FROM на конечной сущности,
 * затем последовательно присоединяются сущности и связи через join.
 * В конце — WHERE, связывающий последнюю сущность с @doc.
 *
 * Пример для пути Incident → Asset → Department:
 *
 *   SELECT array_agg(@e_dept.id),
 *     FROM('demo', @Department, @e_dept),
 *     join('demo', @Asset, @e_asset, on(eq(@e_asset.ownerDept, @e_dept.id))),
 *     join('demo', @Incident_Asset, @l_inc_asset, on(eq(@l_inc_asset.side2, @e_asset.id)))
 *   WHERE @l_inc_asset.side1 = @doc.id
 */
export function buildPathRql(
  path: PathModel,
  table: SymbolTable,
  domain: string,
): { rql: string; error?: string } {
  if (path.steps.length === 0) {
    return { rql: "", error: "Путь не содержит шагов" };
  }

  const targetFqid = path.steps[path.steps.length - 1].toEntityFqid;
  const targetEntity = table.entities.get(targetFqid);
  if (!targetEntity) {
    return { rql: "", error: `Конечная сущность не найдена: ${targetFqid}` };
  }

  const ctx: GeneratorContext = {
    table,
    domain,
    entityAliases: new Map(),
    counter: { n: 0 },
  };

  const targetAlias = aliasForEntity(targetEntity, ctx);

  const fromClause = `FROM('${targetEntity.domain}', @${targetEntity.entity.id}, ${targetAlias})`;
  const joinClauses: string[] = [];
  const whereClauses: string[] = [];

  // conn — выражение, которое даёт id текущей сущности
  let conn = `${targetAlias}.id`;

  // Идём по шагам в обратном порядке
  for (let i = path.steps.length - 1; i >= 0; i--) {
    const step = path.steps[i];
    const isLast = i === 0;

    if (step.kind === "linkage") {
      const linkage = table.linkages.get(step.linkageFqid);
      if (!linkage) {
        return { rql: "", error: `Связь не найдена: ${step.linkageFqid}` };
      }

      const targetSide = step.fromSide === "1" ? "2" : "1";
      const sourceSide = step.fromSide;

      const lAlias = uniqueAlias(`l_${linkage.id}`, ctx);

      joinClauses.push(
        `join('${linkage.domain}', @${linkage.id}, ${lAlias}, on(eq(${lAlias}.side${targetSide}, ${conn})))`,
      );

      const newConn = `${lAlias}.side${sourceSide}`;

      if (isLast) {
        // Последний шаг — связываем с @doc
        whereClauses.push(`eq(${newConn}, @doc.id)`);
      } else {
        conn = newConn;
      }
    } else if (step.kind === "reference") {
      const fromEntity = table.entities.get(step.fromEntityFqid);
      if (!fromEntity) {
        return {
          rql: "",
          error: `Сущность не найдена: ${step.fromEntityFqid}`,
        };
      }

      const eAlias = aliasForEntity(fromEntity, ctx);

      if (isLast) {
        // @doc сам является источником — не присоединяем, а добавляем в WHERE
        whereClauses.push(`eq(@doc.${step.attributeId}, ${conn})`);
      } else {
        joinClauses.push(
          `join('${fromEntity.domain}', @${fromEntity.entity.id}, ${eAlias}, on(eq(${eAlias}.${step.attributeId}, ${conn})))`,
        );
        conn = `${eAlias}.id`;
      }
    }
  }

  const selectClause = `SELECT array_agg(${targetAlias}.id)`;

  const parts = [selectClause, fromClause, ...joinClauses];

  let rql = parts.join(",\n  ");

  if (whereClauses.length > 0) {
    rql += `\nWHERE ${whereClauses.join(" AND ")}`;
  }

  return { rql };
}

// =========================================================================

function aliasForEntity(entity: ResolvedEntity, ctx: GeneratorContext): string {
  const existing = ctx.entityAliases.get(entity.fqid);
  if (existing) return existing;

  const alias = uniqueAlias(`e_${entity.entity.id}`, ctx);
  ctx.entityAliases.set(entity.fqid, alias);
  return alias;
}

function uniqueAlias(base: string, ctx: GeneratorContext): string {
  ctx.counter.n++;
  return `@${base}_${ctx.counter.n}`;
}
