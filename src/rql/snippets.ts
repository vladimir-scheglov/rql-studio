export interface RqlSnippet {
  /** Префикс для вызова в редакторе, например "link-exists" */
  prefix: string;
  /** Отображаемое имя */
  label: string;
  /** Подробное описание для tooltip */
  description: string;
  /** Тело вставки. $1, $2 — позиции табуляции Monaco */
  body: string;
  /** Категория для группировки */
  category: "link" | "user" | "date" | "attribute" | "workflow" | "array";
}

export const RQL_SNIPPETS: RqlSnippet[] = [
  // --- Связи ---
  {
    prefix: "link-exists",
    label: "Проверить наличие связи",
    description:
      "Условие истинно, если у текущего объекта есть хотя бы одна связь указанного типа",
    category: "link",
    body: "SELECT(count(id), FROM('current', @${1:linkage}, @link), WHERE(eq(@link.side1, @doc.id))) > 0",
  },
  {
    prefix: "link-not-exists",
    label: "Проверить отсутствие связи",
    description:
      "Условие истинно, если у текущего объекта нет ни одной связи указанного типа",
    category: "link",
    body: "SELECT(count(id), FROM('current', @${1:linkage}, @link), WHERE(eq(@link.side1, @doc.id))) = 0",
  },
  {
    prefix: "link-attr",
    label: "Проверить атрибут связи",
    description:
      "Условие истинно, если есть связанный объект с заданным значением атрибута связи",
    category: "link",
    body: "SELECT join('current', @${1:linkage}, @link, ON(eq(@link.side1, @doc.id))) WHERE @link.${2:attribute} = ${3:value}",
  },
  {
    prefix: "linked-entity-attr",
    label: "Проверить атрибут связанной сущности",
    description:
      "Условие истинно, если связанная сущность имеет заданное значение атрибута",
    category: "link",
    body: "SELECT join('current', @${1:linkage}, @link, ON(eq(@link.side1, @doc.id))), join('current', @${2:entity}, @e, ON(eq(@link.side2, @e.id))) WHERE @e.${3:attribute} = ${4:value}",
  },

  // --- Пользователь ---
  {
    prefix: "user-has-role",
    label: "Пользователь имеет роль",
    description: "Проверить, что у текущего пользователя есть указанная роль",
    category: "user",
    body: "hasRole('${1:role_name}')",
  },
  {
    prefix: "user-not-has-role",
    label: "Пользователь не имеет роль",
    description: "Проверить, что у текущего пользователя нет указанной роли",
    category: "user",
    body: "NOT hasRole('${1:role_name}')",
  },
  {
    prefix: "user-in-group",
    label: "Пользователь входит в группу",
    description:
      "Проверить, что текущий пользователь входит в указанную группу",
    category: "user",
    body: "hasUserGroup('${1:group_name}')",
  },
  {
    prefix: "user-is-superadmin",
    label: "Пользователь — суперадмин",
    description: "Проверить статус Суперадминистратор",
    category: "user",
    body: "isSuperAdmin()",
  },

  // --- Дата и время ---
  {
    prefix: "date-today",
    label: "Сегодня",
    description: "Значение атрибута равно текущей дате",
    category: "date",
    body: "${1:attribute} = @CurrentDate",
  },
  {
    prefix: "date-in-range",
    label: "Диапазон дат",
    description: "Значение атрибута находится в указанном диапазоне",
    category: "date",
    body: "tsrangeIncludes(TSRANGE('${1:2025-01-01}', '${2:2025-12-31}'), ${3:attribute})",
  },
  {
    prefix: "date-hours-work",
    label: "Рабочие часы",
    description: "Текущее время находится в рабочих часах (8:00–18:00)",
    category: "date",
    body: "DATE_PART('hour', @CurrentTimestamp) >= 8 AND DATE_PART('hour', @CurrentTimestamp) <= 18",
  },
  {
    prefix: "date-current-user",
    label: "Дата создания — сегодня",
    description: "Объект создан сегодня",
    category: "date",
    body: "createdAt >= @CurrentDate",
  },

  // --- Атрибуты ---
  {
    prefix: "attr-required-if",
    label: "Атрибут обязателен, если...",
    description: "Атрибут становится обязательным при выполнении условия",
    category: "attribute",
    body: "${1:attribute} IS NOT NULL",
  },
  {
    prefix: "attr-hidden-if",
    label: "Атрибут скрыт, если...",
    description: "Атрибут скрывается при выполнении условия",
    category: "attribute",
    body: "${1:condition}",
  },

  // --- Workflow ---
  {
    prefix: "wf-status-is",
    label: "Статус workflow равен",
    description: "Проверить текущий статус workflow",
    category: "workflow",
    body: "${1:statusAttribute} = @${2:workflowId}.${3:statusId}",
  },
  {
    prefix: "wf-status-in",
    label: "Статус workflow в списке",
    description: "Проверить, что статус входит в список допустимых",
    category: "workflow",
    body: "${1:statusAttribute} IN SELECT(UNNEST(ARRAY(@${2:workflowId}.${3:status1}, @${2:workflowId}.${4:status2})))",
  },

  // --- Enum ---
  {
    prefix: "enum-is",
    label: "Значение перечисления",
    description: "Проверить значение атрибута-перечисления",
    category: "attribute",
    body: "${1:attribute} = @${2:enumId}.${3:valueId}",
  },
  {
    prefix: "enum-in",
    label: "Значение перечисления из списка",
    description: "Проверить, что значение атрибута входит в список",
    category: "attribute",
    body: "${1:attribute} IN SELECT(UNNEST(ARRAY(@${2:enumId}.${3:value1}, @${2:enumId}.${4:value2})))",
  },

  // --- Массивы ---
  {
    prefix: "array-has",
    label: "Массив содержит элемент",
    description: "Проверить, что массив содержит указанный элемент",
    category: "array",
    body: "has(${1:arrayAttribute}, ${2:value})",
  },
  {
    prefix: "array-has-all",
    label: "Массив содержит все элементы",
    description: "Проверить, что массив содержит все указанные элементы",
    category: "array",
    body: "hasAll(${1:arrayAttribute}, ['${2:value1}', '${3:value2}'])",
  },
  {
    prefix: "array-has-any",
    label: "Массив содержит хотя бы один",
    description: "Проверить, что массив содержит хотя бы один из элементов",
    category: "array",
    body: "hasAny(${1:arrayAttribute}, ['${2:value1}', '${3:value2}'])",
  },

  // --- Значения по умолчанию ---
  {
    prefix: "default-current-user",
    label: "Значение по умолчанию — текущий пользователь",
    description: "В атрибут подставляется текущий пользователь",
    category: "user",
    body: "SELECT @CurrentUser.id",
  },
  {
    prefix: "default-now",
    label: "Значение по умолчанию — сейчас",
    description: "В атрибут подставляется текущая дата и время",
    category: "date",
    body: "SELECT @CurrentTimestamp",
  },
  {
    prefix: "default-uuid",
    label: "Значение по умолчанию — случайный UUID",
    description: "Генерирует новый UUID",
    category: "attribute",
    body: "SELECT gen_random_uuid()",
  },
];
