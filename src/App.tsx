import { CollectionsView } from './components/CollectionsView';
import { useSavedPalettes } from './hooks/useSavedPalettes';
import { PaletteDetailView } from './components/PaletteDetailView';
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
  const palettes = useSavedPalettes();
  const [paletteId, setPaletteId] = useState<string | null>(null);
  const history = useColorHistory();
  const color = useEyeDropper(history.capture);
  const [activeMode, setActiveMode] = useState<InspectorMode>('colors');
  const [view, setView] = useState<'inspector' | 'history' | 'palette' | 'collections'>('inspector');
  const [collectionsMessage, setCollectionsMessage] = useState('');
  const returning = useRef<'archive' | 'details' | 'palette' | null>(null);
  useEffect(() => {
    if (view === 'inspector' && returning.current) {
      const target = returning.current === 'palette'
        ? document.getElementById('view-all-collections')
        : returning.current === 'details'
        ? document.querySelector<HTMLButtonElement>('.color-summary')
        : document.getElementById('view-all-colors') ?? document.getElementById(`tab-${activeMode}`);
      target?.focus();
      returning.current = null;
    }
  }, [view, activeMode, paletteId]);

  const inspectSavedColor = (hex: string) => {
    if (color.isPicking) return;
    color.selectHistory(hex);
    setActiveMode('colors');
    returning.current = 'details';
    setView('inspector');
  };

  const selectedPalette = palettes.palettes.find(palette => palette.id === paletteId);

  return (
    <main className="popup-shell">
      <PopupHeader />
      {view === 'palette' && selectedPalette ? (
        <PaletteDetailView palette={selectedPalette} palettes={palettes} onSelect={inspectSavedColor}
          onBack={() => { setCollectionsMessage(''); setView('collections'); }}
          onDeleted={() => { setCollectionsMessage('Palette deleted.'); setPaletteId(null); setView('collections'); }} />
      ) : view === 'collections' ? (
        <CollectionsView palettes={palettes} message={collectionsMessage}
          onOpen={id => { setPaletteId(id); setView('palette'); }}
          onBack={() => { returning.current = 'palette'; setView('inspector'); }} />
      ) : view === 'history' ? (
        <ColorHistoryView history={history} onSelect={inspectSavedColor} onBack={() => { returning.current = 'archive'; setView('inspector'); }} />
      ) : (
        <>
          <InspectorTabs activeMode={activeMode} onChange={setActiveMode} />
          <InspectorPanel mode={activeMode} color={color} palettes={palettes} />
          <ArchivePreview mode={activeMode} history={history} onSelect={color.selectHistory}
            disabled={color.isPicking} onViewAll={() => setView('history')} />
        </>
      )}
      {view === 'inspector' && <PopupFooter palettes={palettes} onViewAll={() => { setCollectionsMessage(''); setView('collections'); }} onOpen={id => { setPaletteId(id); setView('palette'); }} />}
    </main>
  );
}

export default App;
