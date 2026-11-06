import type { InspectorMode } from './InspectorTabs';

interface ArchivePreviewProps {
  mode: InspectorMode;
}

export function ArchivePreview({ mode }: ArchivePreviewProps) {
  return (
    <section aria-labelledby="archive-heading" className="archive-preview">
      <p className="editorial-label archive-label">YOUR LITTLE ARCHIVE</p>
      <h2 id="archive-heading" className="archive-heading font-editorial">
        {mode === 'colors' ? 'collected colors' : 'collected fonts'}
      </h2>
      <div className="archive-empty">
        <p>Nothing collected yet.</p>
        <div aria-hidden="true" className="archive-dots" />
      </div>
    </section>
  );
}
