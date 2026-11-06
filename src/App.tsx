import { useState } from 'react';
import { ArchivePreview } from './components/ArchivePreview';
import { InspectorPanel } from './components/InspectorPanel';
import { InspectorTabs, type InspectorMode } from './components/InspectorTabs';
import { PopupFooter } from './components/PopupFooter';
import { PopupHeader } from './components/PopupHeader';

function App() {
  const [activeMode, setActiveMode] = useState<InspectorMode>('colors');

  return (
    <main className="popup-shell">
      <PopupHeader />
      <InspectorTabs activeMode={activeMode} onChange={setActiveMode} />
      <InspectorPanel mode={activeMode} />
      <ArchivePreview mode={activeMode} />
      <PopupFooter />
    </main>
  );
}

export default App;
