import { useColorHistory } from './hooks/useColorHistory';
import { useEyeDropper } from './hooks/useEyeDropper';
import { useEffect, useRef, useState } from 'react';
import { ColorHistoryView } from './components/ColorHistoryView';
import { ArchivePreview } from './components/ArchivePreview';
import { InspectorPanel } from './components/InspectorPanel';
import { InspectorTabs, type InspectorMode } from './components/InspectorTabs';
import { PopupFooter } from './components/PopupFooter';
import { PopupHeader } from './components/PopupHeader';

function App() {
  const history = useColorHistory();
  const color = useEyeDropper(history.capture);
  const [activeMode, setActiveMode] = useState<InspectorMode>('colors');
  const [view, setView] = useState<'inspector' | 'history'>('inspector');
  const returning = useRef<'archive' | 'details' | null>(null);
  useEffect(() => {
    if (view === 'inspector' && returning.current) {
      const target = returning.current === 'details'
        ? document.querySelector<HTMLButtonElement>('.color-summary')
        : document.getElementById('view-all-colors') ?? document.getElementById(`tab-${activeMode}`);
      target?.focus();
      returning.current = null;
    }
  }, [view, activeMode]);

  const inspectSavedColor = (hex: string) => {
    if (color.isPicking) return;
    color.selectHistory(hex);
    setActiveMode('colors');
    returning.current = 'details';
    setView('inspector');
  };

  return (
    <main className="popup-shell">
      <PopupHeader />
      {view === 'history' ? (
        <ColorHistoryView history={history} onSelect={inspectSavedColor} onBack={() => { returning.current = 'archive'; setView('inspector'); }} />
      ) : (
        <>
          <InspectorTabs activeMode={activeMode} onChange={setActiveMode} />
          <InspectorPanel mode={activeMode} color={color} />
          <ArchivePreview mode={activeMode} history={history} onSelect={color.selectHistory}
            disabled={color.isPicking} onViewAll={() => setView('history')} />
        </>
      )}
      <PopupFooter />
    </main>
  );
}

export default App;
