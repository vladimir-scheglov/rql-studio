/**
 * Демонстрационная схема для знакомства с приложением.
 *
 * Включает два домена:
 *   - demo.incidents — основной, с сущностями Incident, Asset, Server,
 *     User, Task, Comment.
 *   - demo.dictionaries — справочники (классификация, категории, отделы).
 *
 * Покрывает:
 *   - все базовые типы данных (String, Integer, Decimal, Bool,
 *     Timestamp, Date, Time, IpAddress, MAC, Attachment, Reference,
 *     Array, Enum, Workflow, Identifier);
 *   - наследование сущностей (Server → Asset);
 *   - связи 1-1, 1-N, N-N направленные и ненаправленные;
 *   - атрибуты связей;
 *   - ограничения (required, unique, range, length, regexp);
 *   - dataRules с эффектами required, hidden, readonly, allowed, default;
 *   - сегментированные и несегментированные идентификаторы;
 *   - кросс-доменные ссылки.
 */

export const DEMO_MAIN_DOMAIN = `# =====================================================================
# Демонстрационный домен: Управление инцидентами
# Показывает основные возможности RQL Studio
# =====================================================================

id: demo.incidents
type: domain
version: 1.0.0
name: Demo Incidents
description: Управление инцидентами и связанными активами
status: stable
author: RQL Studio Demo
tags: [demo, incidents]

# =====================================================================
# Пользовательские типы данных
# =====================================================================

dataTypes:
  # Уровень срочности инцидента
  - id: UrgencyLevel
    name: Уровень срочности
    dataType: Enum
    values:
      - id: critical
        name: Критический
      - id: high
        name: Высокий
      - id: medium
        name: Средний
      - id: low
        name: Низкий

  # Приоритет обработки
  - id: Priority
    name: Приоритет
    dataType: Enum
    values:
      - id: p1
        name: P1 — критичный
      - id: p2
        name: P2 — высокий
      - id: p3
        name: P3 — обычный
      - id: p4
        name: P4 — отложенный

  # Статус инцидента (workflow)
  - id: IncidentStatus
    name: Статус инцидента
    dataType: Workflow
    values:
      - id: new
        name: Новый
      - id: triaged
        name: Принят в работу
      - id: in_progress
        name: В работе
      - id: resolved
        name: Решён
      - id: closed
        name: Закрыт
      - id: rejected
        name: Отклонён

  # Статус задачи (workflow)
  - id: TaskStatus
    name: Статус задачи
    dataType: Workflow
    values:
      - id: todo
        name: К выполнению
      - id: in_progress
        name: В работе
      - id: done
        name: Выполнена
      - id: cancelled
        name: Отменена

  # Роль пользователя
  - id: UserRole
    name: Роль пользователя
    dataType: Enum
    values:
      - id: admin
        name: Администратор
      - id: analyst
        name: Аналитик
      - id: engineer
        name: Инженер
      - id: viewer
        name: Наблюдатель

# =====================================================================
# Последовательности для идентификаторов
# =====================================================================

sequences:
  - id: TaskSequence
    startFrom: 1
    description: Последовательность для идентификаторов задач

  - id: CommentSequence
    startFrom: 1
    description: Последовательность для идентификаторов комментариев

# =====================================================================
# Сущности
# =====================================================================

entities:
  # --------------------------------------------------------------
  # Инцидент — главная сущность домена
  # --------------------------------------------------------------
  - id: Incident
    name: Инцидент
    label: "{incidentId}: {subject}"
    description: Инцидент информационной безопасности

    attributes:
      # Сегментированный идентификатор с префиксом по классификации
      - id: incidentId
        name: Идентификатор
        dataType: Identifier
        template: "{@prefix}-{@YY}/{@MM}/{@DD}-{@inc}"
        defaultPrefix: INC
        incrementTemplate: "0000"
        prefixRules:
          - id: PrefixByClassification
            attribute: classification
            source:
              entity: demo.dictionaries/IncidentClassification
              key: name
              value: code

      - id: subject
        name: Тема
        description: Краткое описание инцидента
        dataType: String
        constraints:
          - kind: required
            message: Укажите тему
          - kind: length
            min: 3
            max: 200

      - id: description
        name: Описание
        description: Подробное описание инцидента
        dataType: Text

      - id: status
        name: Статус
        dataType: IncidentStatus

      - id: urgency
        name: Срочность
        dataType: UrgencyLevel

      - id: priority
        name: Приоритет
        dataType: Priority

      - id: dueDate
        name: Срок решения
        dataType: Timestamp

      - id: resolvedAt
        name: Дата решения
        dataType: Timestamp
        readonly: true

      - id: score
        name: Оценка сложности
        description: Числовая оценка от 0.0 до 10.0
        dataType: Decimal
        constraints:
          - kind: range
            min: 0
            max: 10

      - id: severityLevel
        name: Уровень влияния
        description: Целочисленное значение от 1 до 5
        dataType: Integer
        constraints:
          - kind: range
            min: 1
            max: 5

      - id: isConfirmed
        name: Подтверждён
        dataType: Bool

      - id: tags
        name: Теги
        dataType: Array
        item:
          dataType: String
        constraints:
          - kind: length
            max: 20

      - id: affectedAssets
        name: Затронутые активы
        description: Список активов, затронутых инцидентом
        dataType: Array
        item:
          dataType: Reference
          entity: Asset

      - id: attachments
        name: Вложения
        dataType: Array
        item:
          dataType: Attachment
          constraints:
            - kind: mime_types
              mimeTypes:
                - application/pdf
                - image/png
                - image/jpeg
                - text/plain
            - kind: size
              max: 5242880

      - id: classification
        name: Классификация
        description: Ссылка на справочник классификаций
        dataType: Reference
        entity: demo.dictionaries/IncidentClassification

      - id: resolvedById
        name: Кто решил
        dataType: Reference
        entity: User

  # --------------------------------------------------------------
  # Актив — базовая сущность для оборудования
  # --------------------------------------------------------------
  - id: Asset
    name: Актив
    label: "{hostname}"
    description: Устройство или информационный актив

    attributes:
      - id: hostname
        name: Имя хоста
        dataType: String
        constraints:
          - kind: required
          - kind: unique
          - kind: length
            min: 3
            max: 63

      - id: ipAddress
        name: IP-адрес
        dataType: IpAddress

      - id: macAddress
        name: MAC-адрес
        dataType: MAC

      - id: os
        name: Операционная система
        dataType: String

      - id: category
        name: Категория
        dataType: Reference
        entity: demo.dictionaries/AssetCategory

      - id: location
        name: Расположение
        dataType: String

      - id: lastSeen
        name: Последняя активность
        dataType: Timestamp

  # --------------------------------------------------------------
  # Сервер — наследник актива
  # --------------------------------------------------------------
  - id: Server
    name: Сервер
    description: Серверное оборудование (наследник Актива)
    inherits: Asset

    attributes:
      - id: cpuCores
        name: Количество ядер
        dataType: Integer
        constraints:
          - kind: range
            min: 1
            max: 256

      - id: ramGb
        name: Объём ОЗУ (ГБ)
        dataType: Integer
        constraints:
          - kind: range
            min: 1
            max: 4096

      - id: rackLocation
        name: Расположение в стойке
        dataType: String

  # --------------------------------------------------------------
  # Пользователь
  # --------------------------------------------------------------
  - id: User
    name: Пользователь
    label: "{fullName}"
    description: Сотрудник организации

    attributes:
      - id: username
        name: Логин
        dataType: String
        constraints:
          - kind: required
          - kind: unique
          - kind: regexp
            regexp: "^[a-z][a-z0-9_.-]{2,31}$"
            message: Логин должен начинаться с буквы

      - id: fullName
        name: Полное имя
        dataType: String
        constraints:
          - kind: required

      - id: email
        name: Email
        dataType: String
        constraints:
          - kind: regexp
            regexp: "^[^@]+@[^@]+\\\\.[^@]+$"

      - id: role
        name: Роль
        dataType: UserRole

      - id: department
        name: Отдел
        dataType: Reference
        entity: demo.dictionaries/Department

      - id: isActive
        name: Активен
        dataType: Bool

  # --------------------------------------------------------------
  # Задача — связана с инцидентом
  # --------------------------------------------------------------
  - id: Task
    name: Задача
    label: "{taskId}: {title}"

    attributes:
      - id: taskId
        name: Идентификатор
        dataType: Identifier
        sequence: demo.incidents/TaskSequence
        incrementTemplate: "0000"

      - id: title
        name: Заголовок
        dataType: String
        constraints:
          - kind: required
          - kind: length
            max: 200

      - id: description
        name: Описание
        dataType: Text

      - id: status
        name: Статус
        dataType: TaskStatus

      - id: dueDate
        name: Срок
        dataType: Timestamp

      - id: assignee
        name: Исполнитель
        dataType: Reference
        entity: User

  # --------------------------------------------------------------
  # Комментарий
  # --------------------------------------------------------------
  - id: Comment
    name: Комментарий

    attributes:
      - id: text
        name: Текст
        dataType: Text
        constraints:
          - kind: required
          - kind: length
            min: 1
            max: 5000

      - id: author
        name: Автор
        dataType: Reference
        entity: User

# =====================================================================
# Связи
# =====================================================================

linkages:
  # Инцидент ← N-N → Актив: какие активы затронуты
  - id: Incident_Asset
    name: Инцидент связан с активом
    description: Активы, затронутые инцидентом
    side1: Incident
    side2: Asset
    type: n_n
    undirected: true
    nameFrom:
      side1: Затронул актив
      side2: Затронут инцидентом
    attributes:
      - id: impactLevel
        name: Уровень влияния
        dataType: Integer
        constraints:
          - kind: range
            min: 1
            max: 5

  # Инцидент ← 1-N → Задача
  - id: Incident_Task
    name: Инцидент содержит задачи
    side1: Incident
    side2: Task
    type: 1_n
    undirected: false
    nameFrom:
      side1: Содержит задачи
      side2: Относится к инциденту

  # Инцидент ← N-N → Пользователь: ответственные
  - id: Incident_Assignee
    name: Ответственные по инциденту
    side1: Incident
    side2: User
    type: n_n
    undirected: true
    nameFrom:
      side1: Ответственные
      side2: Отвечает за инцидент

  # Актив ← 1-N → Пользователь: владелец
  - id: Asset_Owner
    name: Владелец актива
    side1: Asset
    side2: User
    type: 1_n
    undirected: false
    nameFrom:
      side1: Принадлежит
      side2: Владеет активами

  # Инцидент ← N-N → Комментарий
  - id: Incident_Comment
    name: Комментарии инцидента
    side1: Incident
    side2: Comment
    type: 1_n
    undirected: false
    nameFrom:
      side1: Содержит комментарии
      side2: Относится к инциденту

# =====================================================================
# Правила данных
# =====================================================================

dataRules:
  # Тема обязательна для всех статусов кроме "Новый"
  - id: rule_subject_required
    name: Тема обязательна после принятия в работу
    target: entity
    entity: Incident
    condition: !rql status != @IncidentStatus.new
    message: Заполните тему инцидента
    rule:
      effect: required
      attributes:
        - attribute: subject
          message: Тема обязательна после принятия в работу

  # Идентификатор инцидента нельзя менять
  - id: rule_incident_id_readonly
    name: Идентификатор неизменяем
    target: entity
    entity: Incident
    condition: true
    rule:
      effect: readonly
      attributes:
        - attribute: incidentId

  # Поля "решение" скрыты, пока инцидент не решён
  - id: rule_hide_resolution
    name: Скрыть данные решения до завершения
    target: entity
    entity: Incident
    condition: !rql status IN SELECT(UNNEST(ARRAY(@IncidentStatus.resolved, @IncidentStatus.closed)))
    rule:
      effect: hidden
      attributes:
        - attribute: resolvedAt
        - attribute: resolvedById

  # Решённые инциденты нельзя переоткрывать
  - id: rule_status_allowed
    name: Ограничение статусов
    target: entity
    entity: Incident
    condition: !rql status = @IncidentStatus.closed
    rule:
      effect: allowed
      attributes:
        - attribute: status

  # Дата решения — только текущая
  - id: rule_default_due_date
    name: Срок по умолчанию
    target: entity
    entity: Incident
    condition: true
    rule:
      effect: default
      attributes:
        - attribute: isConfirmed
          value: false

# =====================================================================
# Действия
# =====================================================================

actions:
  - id: action_create_incident
    name: Создать инцидент
    type: open_modal
    modal: forms_newIncident
    operation: create
    entity: Incident
    description: Открыть форму создания инцидента

  - id: action_open_incident
    name: Детали
    type: open_panel
    panel: panels_incident
    entity: Incident
    description: Открыть панель инцидента

  - id: action_remove_incidents
    name: Удалить
    type: bulk
    operation: remove
    entity: Incident

  - id: action_create_asset
    name: Создать актив
    type: open_modal
    modal: forms_newAsset
    operation: create
    entity: Asset

  - id: action_open_asset
    name: Детали
    type: open_panel
    panel: panels_asset
    entity: Asset

  - id: action_create_task
    name: Создать задачу
    type: open_modal
    modal: forms_newTask
    operation: create
    entity: Task

  - id: action_open_task
    name: Детали
    type: open_panel
    panel: panels_task
    entity: Task

  - id: action_create_user
    name: Создать пользователя
    type: open_modal
    modal: forms_newUser
    operation: create
    entity: User

  - id: action_open_user
    name: Детали
    type: open_panel
    panel: panels_user
    entity: User

# =====================================================================
# Меню
# =====================================================================

menus:
  - id: menu_demo
    route: /demo
    label: Демо
    type: root_group
    description: Демонстрационный домен
    placement: top
    items:
      - id: menu_incidents
        route: /demo/incidents
        label: Инциденты
        type: menu
        view: lists_incidents
        description: Список инцидентов

      - id: menu_assets
        route: /demo/assets
        label: Активы
        type: menu
        view: lists_assets

      - id: menu_tasks
        route: /demo/tasks
        label: Задачи
        type: menu
        view: lists_tasks

      - id: menu_users
        route: /demo/users
        label: Пользователи
        type: menu
        view: lists_users
`;

export const DEMO_DICTIONARIES_DOMAIN = `# =====================================================================
# Демонстрационный домен: Справочники
# Используется как источник значений для demo.incidents
# =====================================================================

id: demo.dictionaries
type: domain
version: 1.0.0
name: Demo Dictionaries
description: Справочники для демонстрационного домена
status: stable
author: RQL Studio Demo
tags: [demo, dictionaries]

entities:
  # Классификация инцидентов
  - id: IncidentClassification
    name: Классификация инцидента
    label: "{name}"

    attributes:
      - id: name
        name: Название
        dataType: String
        constraints:
          - kind: required

      - id: code
        name: Код
        description: Короткий код для префикса идентификатора
        dataType: String
        constraints:
          - kind: required
          - kind: length
            min: 2
            max: 8

      - id: description
        name: Описание
        dataType: Text

  # Категория актива
  - id: AssetCategory
    name: Категория актива
    label: "{name}"

    attributes:
      - id: name
        name: Название
        dataType: String
        constraints:
          - kind: required

      - id: description
        name: Описание
        dataType: Text

  # Отдел
  - id: Department
    name: Отдел
    label: "{name}"

    attributes:
      - id: name
        name: Название
        dataType: String
        constraints:
          - kind: required
          - kind: unique

      - id: head
        name: Руководитель
        dataType: String

      - id: contactEmail
        name: Контактный email
        dataType: String

# =====================================================================
# Действия для справочников
# =====================================================================

actions:
  - id: action_create_classification
    name: Создать классификацию
    type: open_modal
    modal: forms_newClassification
    operation: create
    entity: IncidentClassification

  - id: action_open_classification
    name: Детали
    type: open_panel
    panel: panels_classification
    entity: IncidentClassification

  - id: action_create_category
    name: Создать категорию
    type: open_modal
    modal: forms_newCategory
    operation: create
    entity: AssetCategory

  - id: action_open_category
    name: Детали
    type: open_panel
    panel: panels_category
    entity: AssetCategory

  - id: action_create_department
    name: Создать отдел
    type: open_modal
    modal: forms_newDepartment
    operation: create
    entity: Department

  - id: action_open_department
    name: Детали
    type: open_panel
    panel: panels_department
    entity: Department

# =====================================================================
# Меню
# =====================================================================

menus:
  - id: menu_dictionaries
    route: /dictionaries
    label: Справочники
    type: root_group
    description: Справочные данные
    placement: settings
    items:
      - id: menu_classifications
        route: /dictionaries/classifications
        label: Классификации
        type: menu
        view: lists_classifications

      - id: menu_categories
        route: /dictionaries/categories
        label: Категории активов
        type: menu
        view: lists_categories

      - id: menu_departments
        route: /dictionaries/departments
        label: Отделы
        type: menu
        view: lists_departments
`;

export const DEMO_SCHEMA_FILES = [
  { name: "demo.incidents.yaml", content: DEMO_MAIN_DOMAIN },
  { name: "demo.dictionaries.yaml", content: DEMO_DICTIONARIES_DOMAIN },
];
