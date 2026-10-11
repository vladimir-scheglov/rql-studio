import { useSchemaStore } from './store/useSchemaStore';
import { useConstructorStore } from './store/useConstructorStore';
import { useEditorStore } from './store/useEditorStore';
import { SchemaUploader } from './components/SchemaUploader';
import { SchemaExplorer } from './components/SchemaExplorer';
import { RqlEditor } from './components/RqlEditor';
import { ConditionBuilder } from './components/constructor/ConditionBuilder';
import { ContextPicker } from './components/ContextPicker';
import { InspectorPanel } from './components/InspectorPanel';
import { ToastHost } from './components/Toast';
import { YamlEditorModal } from './components/YamlEditorModal';
import { DiagramPanel } from './components/Diagram/DiagramPanel';
import { useEffect, useRef, useState } from 'react';
import { IconFileText, IconHelp, IconMore, IconSearch } from './components/icons';
import { DomainReportModal } from './components/report/DomainReportModal';
import { SchemaValidatorModal } from './components/SchemaValidatorModal';
import { IconShield } from './components/icons';
import { SimulatorPanel } from './components/Simulator/SimulatorPanel';
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { useCommandHotkey } from './components/CommandPalette/useCommandHotkey';
import { useCommandPaletteStore } from './store/useCommandPaletteStore';
import { DiffModal } from './components/Diff/DiffModal';
import { GuideModal } from './components/GuideModal';
import { useLayoutHotkeys } from './hooks/useLayoutHotkeys';
import { InspectorStrip } from './components/InspectorStrip';
import { useLayoutStore } from './store/useLayoutStore';
import { usePathBuilderStore } from './store/usePathBuilderStore';
import { PathBuilderModal } from './components/PathBuilder/PathBuilderModal';

export default function App() {
  const clearSchema = useSchemaStore(s => s.clear);
  const resetConstructor = useConstructorStore(s => s.reset);

  const setValue = useEditorStore(s => s.setValue);
  const setActiveTab = useEditorStore(s => s.setActiveTab);
  const setContext = useEditorStore(s => s.setContext);

  const tab = useEditorStore(s => s.activeTab);
  const setTab = useEditorStore(s => s.setActiveTab);
  const [showReport, setShowReport] = useState(false);
  const [showValidator, setShowValidator] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const inspectorOpen = useLayoutStore(s => s.inspectorOpen);

  const resetAll = () => {
    const confirmed = window.confirm(
      'Очистить схему, конструктор и редактор? Действие необратимо.',
    );
    if (!confirmed) return;

    clearSchema();
    resetConstructor();
    setContext({ kind: 'free' });
    setValue('!rql ');
    setActiveTab('code');
  };

  useCommandHotkey();
  useLayoutHotkeys();

  useEffect(() => {
    const handler = () => setShowGuide(true);
    window.addEventListener('rql-studio:open-guide', handler);
    return () => window.removeEventListener('rql-studio:open-guide', handler);
  }, []);

  const domains = useSchemaStore(s => s.domains);
  const canValidate = domains.length > 0;

  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const pathBuilderOpen = usePathBuilderStore(s => s.open);
  const closePathBuilder = usePathBuilderStore(s => s.closeBuilder);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [headerMenuOpen]);

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-3 shrink-0">
        {/* Логотип */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">RQ</span>
          </div>
          <span className="font-semibold text-sm text-gray-900">RQL Studio</span>
        </div>

        <div className="border-l border-gray-200 h-6 mx-1" />

        {/* Вкладки */}
        <nav className="inline-flex rounded border border-gray-300 overflow-hidden shrink-0">
          <TabButton active={tab === 'code'} onClick={() => setTab('code')}>
            Код
          </TabButton>
          <TabButton active={tab === 'builder'} onClick={() => setTab('builder')}>
            Конструктор
          </TabButton>
          <TabButton active={tab === 'diagram'} onClick={() => setTab('diagram')}>
            Диаграмма
          </TabButton>
          <TabButton active={tab === 'simulator'} onClick={() => setTab('simulator')}>
            Симулятор
          </TabButton>
        </nav>

        {/* Поиск */}
        <button
          onClick={() => useCommandPaletteStore.getState().openPalette()}
          className="ml-auto inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded border border-gray-300 text-gray-500 hover:bg-gray-50 shrink-0"
          title="Открыть палитру команд (Cmd+K)"
        >
          <IconSearch className="w-3.5 h-3.5" />
          <span className="text-gray-400">Поиск</span>
          <kbd className="text-[10px] border border-gray-300 rounded px-1 py-0.5">⌘K</kbd>
        </button>

        {/* Инструменты — иконочные кнопки */}
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            onClick={() => setShowReport(true)}
            disabled={!canValidate}
            title="Отчёт по домену"
          >
            <IconFileText className="w-4 h-4" />
          </IconButton>
          <IconButton
            onClick={() => setShowValidator(true)}
            disabled={!canValidate}
            title="Валидация схем"
          >
            <IconShield className="w-4 h-4" />
          </IconButton>
          <IconButton
            onClick={() => setShowDiff(true)}
            title="Сравнить две версии схемы"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 4 H7 M3 12 H7 M13 4 H9 M13 12 H9 M5 2 V14 M11 2 V14" strokeLinecap="round" />
            </svg>
          </IconButton>
          <IconButton
            onClick={() => setShowGuide(true)}
            title="Руководство пользователя"
          >
            <IconHelp className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Меню «⋯» */}
        <div className="relative shrink-0" ref={headerMenuRef}>
          <button
            onClick={() => setHeaderMenuOpen(v => !v)}
            className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${headerMenuOpen
                ? 'bg-gray-100 border-gray-300 text-gray-800'
                : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            title="Дополнительные действия"
          >
            <IconMore className="w-4 h-4" />
          </button>

          {headerMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 min-w-[200px] bg-white border border-gray-200 rounded shadow-lg py-1">

              <div className="my-1 border-t border-gray-100" />

              <button
                onClick={() => {
                  setHeaderMenuOpen(false);
                  resetAll();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-red-600 hover:bg-red-50"
              >
                <span className="w-4 text-center">🗑</span>
                Сбросить всё
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Левая панель: загрузка и проводник по схеме */}
        <aside className="w-72 border-r border-gray-200 bg-white flex flex-col min-h-0">
          <SchemaUploader />
          <SchemaExplorer />
        </aside>

        {/* Центральная панель: выбор контекста + редактор / конструктор */}
        <main className="flex-1 flex flex-col min-h-0">
          <ContextPicker />
          <div className="flex-1 min-h-0">
            {tab === 'code' && <RqlEditor />}
            {tab === 'builder' && <ConditionBuilder />}
            {tab === 'diagram' && <DiagramPanel />}
            {tab === 'simulator' && <SimulatorPanel />}
          </div>
        </main>

        <div
          className="shrink-0 border-l border-gray-200 bg-white transition-all duration-200 ease-in-out overflow-hidden"
          style={{ width: inspectorOpen ? 320 : 36 }}
        >
          {inspectorOpen ? (
            <aside className="w-80 flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 bg-gray-50 shrink-0">
                <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  Инспектор
                </h2>
                <button
                  onClick={() => useLayoutStore.getState().setInspectorOpen(false)}
                  title="Свернуть инспектор (Cmd+Alt+B)"
                  className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M5 3 L10 7 L5 11" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                <InspectorPanel />
              </div>
            </aside>
          ) : (
            <InspectorStrip />
          )}
        </div>
      </div>
      <ToastHost />
      <YamlEditorModal />
      <CommandPalette />
      {showReport && <DomainReportModal onClose={() => setShowReport(false)} />}
      {showValidator && (
        <SchemaValidatorModal onClose={() => setShowValidator(false)} />
      )}
      {showDiff && <DiffModal onClose={() => setShowDiff(false)} />}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
      {pathBuilderOpen && <PathBuilderModal onClose={closePathBuilder} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 last:border-r-0 ${active
          ? 'bg-gray-900 text-white'
          : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}