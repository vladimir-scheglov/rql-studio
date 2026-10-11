export type FQDN = string; // например, "iocs.test"
export type DataId = string; // идентификатор сущности/атрибута

export interface DomainSchema {
  id: FQDN;
  type: "domain";
  version: string;
  name: string;
  description?: string;
  status?: string;
  date?: string;
  author?: string;
  tags?: string[];

  entities?: Entity[];
  dataTypes?: DataType[];
  sequences?: Sequence[];
  linkages?: Linkage[];
  trees?: Tree[];
  transitiveLinkages?: TransitiveLinkage[];
  mixins?: Mixin[];
  dataRules?: DataRule[];
  actions?: Action[];
  medias?: Media[];
  views?: View[];
  menus?: Menu[];
  counterColorPattern?: CounterColorPattern[];
}

export interface Entity {
  id: DataId;
  name?: string;
  label?: string;
  description?: string;
  kind?: "regular";
  inherits?: string;
  attributes?: Attribute[];
  sorting?: Sorting[];
  identification?: unknown[];
  reconciliation?: unknown[];
  projection?: Projection[];
  searching?: Searching;
}

export interface Attribute {
  id: DataId;
  name?: string;
  description?: string;
  dataType: string; // String, Integer, Reference, Array, Identifier, ...
  entity?: string; // для Reference
  item?: ArrayItem; // для Array
  constraints?: Constraint[];
  readonly?: boolean;
  sequence?: string;
  template?: string;
  defaultPrefix?: string;
  incrementTemplate?: string;
  prefixRules?: PrefixRule[];
  calculation?: { schemaId: string; id: string };
}

export interface ArrayItem {
  dataType: string;
  entity?: string;
  constraints?: Constraint[];
}

export interface Constraint {
  kind: string;
  message?: string;
  min?: number;
  max?: number;
  regexp?: string;
  mimeTypes?: string[];
}

export interface DataType {
  id: DataId;
  name?: string;
  description?: string;
  dataType: "Enum" | "Workflow" | "Table";
  values?: EnumValue[];
  /** Для dataType: Table — описание столбцов */
  attributes?: Attribute[];
}

export interface EnumValue {
  id: string;
  name?: string;
  description?: string;
  value?: string | number;
}

export interface Linkage {
  id: DataId;
  name?: string;
  description?: string;
  side1: string;
  side2: string;
  type: "1_1" | "1_n" | "n_n";
  undirected?: boolean;
  useForSearch?: boolean;
  nameFrom?: { side1: string; side2: string };
  attributes?: Attribute[];
}

export interface Sorting {
  id: DataId;
  name?: string;
  by: { attribute: string; direction: "asc" | "desc" }[];
  createIndex?: boolean;
}

export interface Projection {
  attribute: string;
}

export interface Searching {
  attributes: string[];
}

export interface Sequence {
  id: DataId;
  startFrom?: number;
  description?: string;
}

export interface PrefixRule {
  id: DataId;
  attribute: string;
  source: { entity: string; key: string; value: string };
}

export interface Tree {
  id: DataId; /* ... */
}
export interface TransitiveLinkage {
  id: DataId; /* ... */
}
export interface Mixin {
  id: DataId; /* ... */
}
export interface DataRule {
  id: DataId;
  name?: string;
  description?: string;
  target?: "entity";
  entity?: string;
  attribute?: string;
  condition?: unknown;
  rule?: {
    effect?: string;
    attributes?: {
      attribute: string;
      message?: string;
      help?: string;
    }[];
  };
  message?: string;
  help?: string;
}
export interface Action {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  entity?: string;
  operation?: string;
  /** для open_modal / open_page */
  modal?: string;
  panel?: string;
  view?: string;
}
export interface Media {
  id: string; /* ... */
}
export interface View {
  id: string; /* ... */
}
export interface MenuItem {
  id: string;
  route: string;
  label?: string;
  description?: string;
  type?: string;
  view?: string;
  priority?: number;
}

export interface Menu {
  id: string;
  route: string;
  label?: string;
  description?: string;
  type?: "root_group" | "root_menu" | "menu";
  placement?: "top" | "settings";
  priority?: number;
  icon?: string;
  view?: string;
  items?: MenuItem[];
}
export interface CounterColorPattern {
  id: string; /* ... */
}
