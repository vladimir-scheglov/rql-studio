import type { Attribute } from "./types";

export const SYSTEM_ATTRIBUTES: Attribute[] = [
  { id: "id", name: "Идентификатор объекта", dataType: "Uuid" },
  {
    id: "organizationId",
    name: "Организация",
    dataType: "Reference",
    entity: "Organization",
  },
  { id: "domainId", name: "Идентификатор домена", dataType: "String" },
  { id: "entityId", name: "Идентификатор сущности", dataType: "String" },
  { id: "entityName", name: "Название сущности", dataType: "String" },
  { id: "createdAt", name: "Дата создания", dataType: "Timestamp" },
  { id: "createdBy", name: "Создал", dataType: "Reference", entity: "User" },
  { id: "updatedAt", name: "Дата изменения", dataType: "Timestamp" },
  { id: "updatedBy", name: "Изменил", dataType: "Reference", entity: "User" },
  {
    id: "tenantId",
    name: "Идентификатор тенанта",
    dataType: "Reference",
    entity: "Tenant",
  },
  { id: "label", name: "Лейбл", dataType: "String" },
  { id: "version", name: "Версия объекта", dataType: "Integer" },
];

/** Системные атрибуты, которые часто используются в правилах */
export const COMMON_SYSTEM_ATTRIBUTE_IDS = new Set([
  "id",
  "label",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
]);

export const SYSTEM_LINKAGE_ATTRIBUTES: Attribute[] = [
  { id: "id", name: "Идентификатор связи", dataType: "Uuid" },
  { id: "side1", name: "Сторона 1", dataType: "Reference" },
  { id: "side2", name: "Сторона 2", dataType: "Reference" },
  { id: "createdAt", name: "Дата создания", dataType: "Timestamp" },
  { id: "createdBy", name: "Создал", dataType: "Reference" },
  { id: "updatedAt", name: "Дата изменения", dataType: "Timestamp" },
  { id: "updatedBy", name: "Изменил", dataType: "Reference" },
  { id: "tenantId", name: "Идентификатор тенанта", dataType: "Reference" },
  { id: "label", name: "Лейбл", dataType: "String" },
  { id: "version", name: "Версия объекта", dataType: "Integer" },
];