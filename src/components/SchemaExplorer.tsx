import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSchemaStore } from '../store/useSchemaStore';
import { useEditorStore } from '../store/useEditorStore';
import { useSchemaUiStore } from '../store/useSchemaUiStore';
import { useConstructorStore } from '../store/useConstructorStore';
import {
  resolveEntityFqid,
  type ResolvedEntity,
  type ResolvedLinkage,
  type ResolvedAttribute,
} from '../schema/symbol-table';
import { nextId, type LinkageNode } from '../constructor/types';
import { IconFolder, IconGrid, IconLink, IconSearch, IconShield } from './icons';
import { AttributeTooltip } from './AttributeTooltip';
import { LinkageTooltip } from './LinkageTooltip';
import { TooltipAtPointer } from './TooltipAtPointer';
import { showToast } from './Toast';
import type { DataRule } from '../schema/types';
import { parseDataRule } from '../constructor/import-rule';
import { useConstructorUiStore } from '../store/useConstructorUiStore';
import { findAttributeUsages, findAttributeUsagesInText } from '../constructor/find-usages';
import { useCurrentRuleStore } from '../store/useCurrentRuleStore';
import { RulesPanel } from './RulesPanel';

type TooltipData =
  | { kind: 'attribute'; attr: ResolvedAttribute; entityFqid: string }
  | { kind: 'linkage'; linkage: ResolvedLinkage };

export function SchemaExplorer() {
  const symbolTable = useSchemaStore(s => s.symbolTable);
  const domains = useSchemaStore(s => s.domains);
  const activeDomainId = useSchemaStore(s => s.activeDomainId);
  const setActiveDomain = useSchemaStore(s => s.setActiveDomain);
  const setContext = useEditorStore(s => s.setContext);
  const setActiveTab = useEditorStore(s => s.setActiveTab);

  const addChild = useConstructorStore(s => s.addChild);
  const root = useConstructorStore(s => s.root);

  const focusTarget = useSchemaUiStore(s => s.focusTarget);
  const focusNonce = useSchemaUiStore(s => s.focusNonce);
  const explorerMode = useSchemaUiStore(s => s.explorerMode);
  const setExplorerMode = useSchemaUiStore(s => s.setExplorerMode);

  const [expandedDomains, setExpandedDomains] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedLinks, setExpandedLinks] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState('');
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const itemRefs = useRef<Record<string, HTMLElement | null>>({});
  const tooltipTimer = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ data: TooltipData; x: number; y: number } | null>(null);

  const setUsageSearch = useConstructorUiStore(s => s.setUsageSearch);
  const editorValue = useEditorStore(s => s.value);

  const scheduleTooltip = (data: TooltipData, e: React.MouseEvent) => {
    if (tooltipTimer.current) window.clearTimeout(tooltipTimer.current);
    const x = e.clientX;
    const y = e.clientY;
    tooltipTimer.current = window.setTimeout(() => {
      setTooltip({ data, x, y });
    }, 300);
  };

  const hideTooltip = () => {
    if (tooltipTimer.current) {
      window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
    setTooltip(null);
  };

  useEffect(() => {
    setExpandedDomains(prev => {
      const next = { ...prev };
      for (const d of domains) {
        if (next[d.id] === undefined) next[d.id] = true;
      }
      return next;
    });
  }, [domains]);

  // --- Entities mode: фильтрованный список ---
  const filtered = useMemo(() => {
    if (!symbolTable) return [];
    return domains
      .map(d => ({
        domain: d,
        entities: (symbolTable.entitiesByDomain.get(d.id) ?? [])
          .filter(e => matchesEntity(e, filter)),
      }))
      .filter(d => d.entities.length > 0 || !filter);
  }, [symbolTable, domains, filter]);

  // --- Linkages mode: список связей, сгруппированный по домену ---
  const linkagesByDomain = useMemo(() => {
    if (!symbolTable) return [];
    const map = new Map<string, ResolvedLinkage[]>();
    for (const linkage of symbolTable.linkages.values()) {
      if (!matchesLinkage(linkage, filter, symbolTable)) continue;
      const list = map.get(linkage.domain) ?? [];
      list.push(linkage);
      map.set(linkage.domain, list);
    }
    return domains
      .map(d => ({ domain: d, linkages: map.get(d.id) ?? [] }))
      .filter(d => d.linkages.length > 0 || !filter);
  }, [symbolTable, domains, filter]);

  const [expandedRules, setExpandedRules] = useState<Record<string, boolean>>({});
  const setRoot = useConstructorStore(s => s.setRoot);
  const setCurrentRule = useCurrentRuleStore(s => s.setCurrentRule);

  const rulesByEntity = useMemo(() => {
    const map = new Map<string, DataRule[]>();
    for (const domain of domains) {
      for (const rule of domain.dataRules ?? []) {
        if (!rule.entity) continue;
        const entityFqid = `${domain.id}/${rule.entity}`;
        const list = map.get(entityFqid) ?? [];
        list.push(rule);
        map.set(entityFqid, list);
      }
    }
    return map;
  }, [domains]);

  const openRule = (rule: DataRule, domainId: string) => {
    if (!symbolTable) return;
    const fallback = activeDomainId ? `${activeDomainId}/` : '';
    const entityFqid = `${domainId}/${rule.entity}`;
    const { result, errors } = parseDataRule(rule, symbolTable, domainId, entityFqid);

    if (!result) {
      alert('Не удалось открыть правило:\n\n' + errors.join('\n'));
      return;
    }

    if (errors.length > 0) {
      showToast('Правило открыто с предупреждениями');
    } else {
      showToast('Правило открыто');
    }

    setRoot(result.root);
    setCurrentRule(result.ruleId, result.effect, result.isUnconditional);
    setActiveTab('builder');

    // Обновляем контекст на сущность правила
    setContext({ kind: 'condition', entityFqid: `${domainId}/${rule.entity}` });
  };

  // Связи для сущности
  const linkagesByEntity = useMemo(() => {
    const map = new Map<string, ResolvedLinkage[]>();
    if (!symbolTable) return map;

    for (const linkage of symbolTable.linkages.values()) {
      const side1 = resolveEntityFqid(linkage.side1, linkage.domain, symbolTable);
      const side2 = resolveEntityFqid(linkage.side2, linkage.domain, symbolTable);
      if (side1) map.set(side1, [...(map.get(side1) ?? []), linkage]);
      if (side2 && side2 !== side1) map.set(side2, [...(map.get(side2) ?? []), linkage]);
    }
    return map;
  }, [symbolTable]);

  // Фокус
  useEffect(() => {
    if (!focusTarget || !symbolTable) return;

    let targetFqid: string | null = null;
    if (focusTarget.kind === 'entity') targetFqid = focusTarget.fqid;
    else if (focusTarget.kind === 'linkage') {
      const linkage = symbolTable.linkages.get(focusTarget.fqid);
      if (linkage) {
        targetFqid =
          resolveEntityFqid(linkage.side1, linkage.domain, symbolTable) ?? null;
      }
    }

    if (!targetFqid) return;
    const entity = symbolTable.entities.get(targetFqid);
    if (entity) setExpandedDomains(prev => ({ ...prev, [entity.domain]: true }));
    setExpanded(prev => ({ ...prev, [targetFqid!]: true }));
    setHighlighted(targetFqid);

    requestAnimationFrame(() => {
      itemRefs.current[targetFqid!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    const t = window.setTimeout(() => setHighlighted(null), 2000);
    return () => window.clearTimeout(t);
  }, [focusTarget, focusNonce, symbolTable]);

  const copyId = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Скопировано: ' + text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Скопировано: ' + text);
    }
  };

  // Добавить связь в правило
  const addLinkageToRule = (linkage: ResolvedLinkage, currentSide: '1' | '2') => {
    if (!symbolTable) return;

    const otherSide = currentSide === '1' ? linkage.side2 : linkage.side1;
    const targetEntityFqid =
      resolveEntityFqid(otherSide, linkage.domain, symbolTable) ?? '';

    const node: LinkageNode = {
      id: nextId('lk'),
      kind: 'linkage',
      linkageFqid: linkage.fqid,
      side: currentSide,
      targetEntityFqid,
      mode: 'exists',
      nested: null,
    };

    addChild(root.id, node);
    showToast(`Связь «${linkage.name ?? linkage.id}» добавлена`);
    setActiveTab('builder');
  };

  if (!symbolTable) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center px-3 py-2 border-b border-gray-200">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Элементы
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-xs text-gray-400 text-center leading-relaxed">
            Загрузите схему, чтобы увидеть
            <br />
            домены и сущности
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Заголовок с toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 shrink-0">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Элементы
        </div>

        <div className="inline-flex rounded overflow-hidden border border-gray-200">
          <button
            onClick={() => setExplorerMode('entities')}
            title="Сущности и атрибуты"
            className={`px-2 py-0.5 text-[11px] transition-colors ${explorerMode === 'entities'
              ? 'bg-gray-800 text-white'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Сущности
          </button>
          <button
            onClick={() => setExplorerMode('linkages')}
            title="Все связи домена"
            className={`px-2 py-0.5 text-[11px] border-l border-gray-200 transition-colors ${explorerMode === 'linkages'
              ? 'bg-gray-800 text-white'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Связи
          </button>
          <button
            onClick={() => setExplorerMode('rules')}
            title="Все правила данных"
            className={`px-2 py-0.5 text-[11px] border-l border-gray-200 transition-colors ${explorerMode === 'rules'
              ? 'bg-gray-800 text-white'
              : 'text-gray-600 hover:bg-gray-50'
              }`}
          >
            Правила
          </button>
        </div>
      </div>

      {/* Поиск */}
      <div className="p-2 border-b border-gray-100 shrink-0">
        <input
          type="text"
          placeholder={explorerMode === 'entities' ? 'Поиск по сущности...' : 'Поиск по связи...'}
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
      </div>

      <div className="overflow-auto flex-1 text-sm">
        {explorerMode === 'entities' && (
          <>
            {filtered.map(({ domain, entities }) => {
              const isDomainOpen = filter ? true : expandedDomains[domain.id] !== false;
              const isActive = domain.id === activeDomainId;

              return (
                <div key={domain.id}>
                  <button
                    onClick={() => {
                      setExpandedDomains(s => ({ ...s, [domain.id]: !isDomainOpen }));
                      setActiveDomain(domain.id);
                    }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors ${isActive ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                      }`}
                  >
                    <span className="text-gray-400 shrink-0">{isDomainOpen ? '▾' : '▸'}</span>
                    <IconFolder
                      className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}
                    />
                    <span
                      className={`text-xs font-medium truncate flex-1 ${isActive ? 'text-blue-900' : 'text-gray-800'
                        }`}
                      title={domain.id}
                    >
                      {domain.name}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                      {entities.length}
                    </span>
                  </button>

                  {isDomainOpen &&
                    entities.map(entity => {
                      const isOpen = expanded[entity.fqid] === true;
                      const isHighlighted = highlighted === entity.fqid;
                      const links = linkagesByEntity.get(entity.fqid) ?? [];
                      const linksOpen = expandedLinks[entity.fqid] === true;
                      const rules = rulesByEntity.get(entity.fqid) ?? [];
                      const rulesOpen = expandedRules[entity.fqid] === true;

                      return (
                        <div key={entity.fqid}>
                          <button
                            ref={el => {
                              itemRefs.current[entity.fqid] = el;
                            }}
                            onClick={() =>
                              setExpanded(s => ({ ...s, [entity.fqid]: !isOpen }))
                            }
                            className={`w-full flex items-center gap-1.5 pl-6 pr-2 py-1 text-left transition-colors ${isHighlighted
                              ? 'bg-blue-100 ring-1 ring-blue-300'
                              : 'hover:bg-gray-50'
                              }`}
                          >
                            <span className="text-gray-400 shrink-0">
                              {isOpen ? '▾' : '▸'}
                            </span>
                            <IconGrid className="w-3 h-3 text-gray-500 shrink-0" />
                            <span
                              className="text-xs text-gray-700 truncate flex-1"
                              title={entity.entity.name ?? entity.entity.id}
                            >
                              {entity.entity.name ?? entity.entity.id}
                            </span>
                            <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                              {entity.attributes.size}
                            </span>
                          </button>

                          {isOpen && (
                            <>
                              <ul className="pb-0.5">
                                {[...entity.attributes.values()].map(attr => (
                                  <li
                                    key={attr.id}
                                    className="group/attr pl-11 pr-2 py-0.5 cursor-pointer hover:bg-blue-50 flex items-center justify-between gap-2"
                                    onClick={e => {
                                      if (e.ctrlKey || e.metaKey) {
                                        e.preventDefault();
                                        copyId(attr.id);
                                        return;
                                      }
                                      hideTooltip();
                                      setContext({
                                        kind: 'constraint',
                                        entityFqid: entity.fqid,
                                        attributeId: attr.id,
                                      });
                                    }}
                                    onMouseEnter={e =>
                                      scheduleTooltip(
                                        {
                                          kind: 'attribute',
                                          attr,
                                          entityFqid: entity.fqid,
                                        },
                                        e,
                                      )
                                    }
                                    onMouseLeave={hideTooltip}
                                  >
                                    <span
                                      className="text-xs text-gray-600 truncate flex-1"
                                      title={attr.name ?? attr.id}
                                    >
                                      {attr.name ?? attr.id}
                                    </span>
                                    <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                                      {attr.dataType}
                                    </span>

                                    <button
                                      onClick={e => {
                                        e.stopPropagation();
                                        const usages = findAttributeUsagesInText(editorValue, attr.id);
                                        setUsageSearch(attr.id, usages);
                                        if (usages.length === 0) {
                                          showToast(`«${attr.name ?? attr.id}» не используется в правиле`);
                                        } else {
                                          showToast(
                                            `Найдено ${usages.length} ${pluralUsages(usages.length)} в правиле`,
                                          );
                                        }
                                      }}
                                      title="Найти вхождения в правиле"
                                      className="opacity-0 group-hover/attr:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-100 transition-opacity"
                                    >
                                      <IconSearch />
                                    </button>
                                  </li>
                                ))}
                              </ul>

                              {/* Связи сущности */}
                              <>
                                <button
                                  onClick={() =>
                                    setExpandedLinks(s => ({
                                      ...s,
                                      [entity.fqid]: !linksOpen,
                                    }))
                                  }
                                  className="w-full flex items-center gap-1.5 pl-11 pr-2 py-0.5 text-left hover:bg-gray-50"
                                >
                                  <span className="text-gray-400 shrink-0">
                                    {linksOpen ? '▾' : '▸'}
                                  </span>
                                  <IconLink className="w-3 h-3 text-purple-500 shrink-0" />
                                  <span className="text-[11px] text-gray-500 italic flex-1">
                                    Связи
                                  </span>
                                  <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                                    {links.length}
                                  </span>
                                </button>

                                {linksOpen && (
                                  <>
                                    {links.length === 0 ? (
                                      <div className="pl-16 pr-2 py-0.5 text-[11px] text-gray-400 italic">
                                        Связей нет
                                      </div>
                                    ) : (
                                      <ul className="pb-0.5">
                                        {links.map(linkage => {
                                          const role = getLinkageRole(
                                            linkage,
                                            entity.fqid,
                                            symbolTable,
                                          );
                                          if (!role) return null;

                                          return (
                                            <li
                                              key={linkage.fqid + ':' + role.side}
                                              className="group/link pl-16 pr-2 py-0.5 cursor-pointer hover:bg-purple-50 flex items-center gap-1.5"
                                              onClick={e => {
                                                if (e.ctrlKey || e.metaKey) {
                                                  e.preventDefault();
                                                  copyId(linkage.id);
                                                  return;
                                                }
                                                hideTooltip();
                                              }}
                                              onMouseEnter={e =>
                                                scheduleTooltip({ kind: 'linkage', linkage }, e)
                                              }
                                              onMouseLeave={hideTooltip}
                                            >
                                              <span
                                                className="text-xs text-gray-600 truncate flex-1"
                                                title={linkage.name ?? linkage.id}
                                              >
                                                <span className="text-gray-400">
                                                  {role.label}
                                                </span>{' '}
                                                {linkage.name ?? linkage.id}
                                              </span>

                                              <TypeBadge type={linkage.type} />

                                              <button
                                                onClick={e => {
                                                  e.stopPropagation();
                                                  addLinkageToRule(linkage, role.side);
                                                }}
                                                title="Добавить связь в правило"
                                                className="opacity-0 group-hover/link:opacity-100 w-5 h-5 flex items-center justify-center rounded text-purple-600 hover:bg-purple-100 transition-opacity"
                                              >
                                                <PlusMini />
                                              </button>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </>
                                )}
                              </>

                              {/* Правила данных */}
                              {rules.length > 0 && (
                                <>
                                  <button
                                    onClick={() =>
                                      setExpandedRules(s => ({ ...s, [entity.fqid]: !rulesOpen }))
                                    }
                                    className="w-full flex items-center gap-1.5 pl-11 pr-2 py-0.5 text-left hover:bg-gray-50"
                                  >
                                    <span className="text-gray-400 shrink-0">{rulesOpen ? '▾' : '▸'}</span>
                                    <IconShield className="w-3 h-3 text-emerald-500 shrink-0" />
                                    <span className="text-[11px] text-gray-500 italic flex-1">
                                      Правила данных
                                    </span>
                                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                                      {rules.length}
                                    </span>
                                  </button>

                                  {rulesOpen && (
                                    <ul className="pb-0.5">
                                      {rules.map(rule => (
                                        <li
                                          key={rule.id}
                                          className="pl-16 pr-2 py-0.5 cursor-pointer hover:bg-emerald-50 flex items-center gap-1.5"
                                          onClick={() => openRule(rule, /* домен, к которому относится правило */ domain.id)}
                                        >
                                          <span className="text-xs text-gray-600 truncate flex-1" title={rule.name ?? rule.id}>
                                            {rule.name ?? rule.id}
                                          </span>
                                          {rule.rule?.effect && (
                                            <span className="text-[9px] font-mono px-1 rounded bg-emerald-100 text-emerald-700 shrink-0">
                                              {rule.rule.effect}
                                            </span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </>
        )}

        {explorerMode === 'linkages' && (
          <>
            {linkagesByDomain.map(({ domain, linkages }) => {
              const isDomainOpen = filter ? true : expandedDomains[domain.id] !== false;
              const isActive = domain.id === activeDomainId;

              return (
                <div key={domain.id}>
                  <button
                    onClick={() => {
                      setExpandedDomains(s => ({ ...s, [domain.id]: !isDomainOpen }));
                      setActiveDomain(domain.id);
                    }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors ${isActive ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                      }`}
                  >
                    <span className="text-gray-400 shrink-0">
                      {isDomainOpen ? '▾' : '▸'}
                    </span>
                    <IconFolder
                      className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-500'
                        }`}
                    />
                    <span
                      className={`text-xs font-medium truncate flex-1 ${isActive ? 'text-blue-900' : 'text-gray-800'
                        }`}
                      title={domain.id}
                    >
                      {domain.name}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 tabular-nums">
                      {linkages.length}
                    </span>
                  </button>

                  {isDomainOpen && (
                    <ul className="pb-0.5">
                      {linkages.map(linkage => (
                        <li
                          key={linkage.fqid}
                          className="group/link pl-8 pr-2 py-1 cursor-pointer hover:bg-purple-50 flex items-center gap-2"
                          onMouseEnter={e =>
                            scheduleTooltip({ kind: 'linkage', linkage }, e)
                          }
                          onMouseLeave={hideTooltip}
                        >
                          <IconLink className="w-3 h-3 text-purple-500 shrink-0" />

                          <div className="flex-1 min-w-0">
                            <div
                              className="text-xs text-gray-700 truncate"
                              title={linkage.name ?? linkage.id}
                            >
                              {linkage.name ?? linkage.id}
                            </div>
                            <div className="text-[10px] text-gray-400 truncate">
                              {shortEntity(linkage.side1)} → {shortEntity(linkage.side2)}
                            </div>
                          </div>

                          <TypeBadge type={linkage.type} />

                          <button
                            onClick={e => {
                              e.stopPropagation();
                              // По умолчанию добавляем со стороны 1
                              addLinkageToRule(linkage, '1');
                            }}
                            title="Добавить связь в правило"
                            className="opacity-0 group-hover/link:opacity-100 w-5 h-5 flex items-center justify-center rounded text-purple-600 hover:bg-purple-100 transition-opacity"
                          >
                            <PlusMini />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}

        {explorerMode === 'rules' && <RulesPanel />}

        {explorerMode === 'entities' && filtered.length === 0 && (
          <div className="px-3 py-6 text-xs text-gray-400 text-center">
            Ничего не найдено
          </div>
        )}
        {explorerMode === 'linkages' && linkagesByDomain.length === 0 && (
          <div className="px-3 py-6 text-xs text-gray-400 text-center">
            Ничего не найдено
          </div>
        )}
      </div>

      {tooltip &&
        createPortal(
          <TooltipAtPointer
            x={tooltip.x}
            y={tooltip.y}
            content={
              tooltip.data.kind === 'attribute' ? (
                <AttributeTooltip
                  attr={tooltip.data.attr}
                  entityFqid={tooltip.data.entityFqid}
                  compact
                />
              ) : (
                <LinkageTooltip linkage={tooltip.data.linkage} compact />
              )
            }
          />,
          document.body,
        )}
    </div>
  );
}

// --- Вспомогательные компоненты ------------------------------------------

function TypeBadge({ type }: { type: ResolvedLinkage['type'] }) {
  const label =
    type === '1_1' ? '1:1'
      : type === '1_n' ? '1:N'
        : 'N:N';
  return (
    <span
      className="text-[9px] font-mono px-1 rounded bg-gray-100 text-gray-500 shrink-0"
      title={`Тип связи: ${label}`}
    >
      {label}
    </span>
  );
}

function PlusMini() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 2 V10 M2 6 H10" strokeLinecap="round" />
    </svg>
  );
}

// --- Вспомогательные функции ---------------------------------------------

/** Возвращает роль сущности в связи: сторону и глагольное описание */
function getLinkageRole(
  linkage: ResolvedLinkage,
  entityFqid: string,
  table: any,
): { side: '1' | '2'; label: string } | null {
  const side1Fqid = resolveEntityFqid(linkage.side1, linkage.domain, table);
  const side2Fqid = resolveEntityFqid(linkage.side2, linkage.domain, table);

  if (side1Fqid === entityFqid) {
    return {
      side: '1',
      label: linkage.nameFrom?.side1 ?? '→',
    };
  }
  if (side2Fqid === entityFqid) {
    return {
      side: '2',
      label: linkage.nameFrom?.side2 ?? '←',
    };
  }
  return null;
}

function shortEntity(ref: string): string {
  const slash = ref.indexOf('/');
  return slash === -1 ? ref : ref.slice(slash + 1);
}

function matchesEntity(entity: ResolvedEntity, filter: string): boolean {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  if (entity.entity.id.toLowerCase().includes(needle)) return true;
  if (entity.entity.name?.toLowerCase().includes(needle)) return true;
  for (const attr of entity.attributes.values()) {
    if (attr.id.toLowerCase().includes(needle)) return true;
    if (attr.name?.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function matchesLinkage(
  linkage: ResolvedLinkage,
  filter: string,
  table: any,
): boolean {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  if (linkage.id.toLowerCase().includes(needle)) return true;
  if (linkage.name?.toLowerCase().includes(needle)) return true;
  if (linkage.side1.toLowerCase().includes(needle)) return true;
  if (linkage.side2.toLowerCase().includes(needle)) return true;
  return false;
}

function pluralUsages(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вхождение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'вхождения';
  return 'вхождений';
}