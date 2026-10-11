import type { ResolvedLinkage } from "../schema/symbol-table";
import type { Attribute } from "../schema/types";

/** Один шаг в пути */
export type PathStep =
  | {
      id: string;
      kind: "linkage";
      /** Связь, через которую идём */
      linkageFqid: string;
      /** Сторона, на которой находится исходная сущность */
      fromSide: "1" | "2";
      /** Сущность, от которой идём (кэшируется для UI) */
      fromEntityFqid: string;
      /** Сущность, к которой приходим */
      toEntityFqid: string;
    }
  | {
      id: string;
      kind: "reference";
      /** Атрибут типа Reference, через который переходим */
      attributeId: string;
      /** Сущность, от которой идём */
      fromEntityFqid: string;
      /** Сущность, к которой приходим (из attribute.entity) */
      toEntityFqid: string;
    };

export interface PathModel {
  /** Стартовая сущность — та, для которой строится правило (@doc) */
  startEntityFqid: string;
  steps: PathStep[];
}

/** Доступный переход из сущности */
export interface AvailableTransition {
  kind: "linkage" | "reference";
  /** Отображаемое название */
  label: string;
  /** Куда приходим */
  targetEntityFqid: string;
  /** Для linkage */
  linkage?: ResolvedLinkage;
  fromSide?: "1" | "2";
  /** Для reference */
  attribute?: Attribute;
}

/** Результат генерации */
export interface GeneratedPath {
  /** Полный RQL-запрос (без !rql) */
  rql: string;
  /** Готовый YAML-фрагмент dataRules */
  yaml: string;
  /** Ошибка, если сгенерировать не удалось */
  error?: string;
}
