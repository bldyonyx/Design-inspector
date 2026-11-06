import { useRef, type KeyboardEvent } from 'react';

export type InspectorMode = 'colors' | 'fonts';

interface InspectorTabsProps {
  activeMode: InspectorMode;
  onChange: (mode: InspectorMode) => void;
}

const tabs = [
  { id: 'colors' as const, label: '01 / Colors' },
  { id: 'fonts' as const, label: '02 / Fonts' },
];

export function InspectorTabs({ activeMode, onChange }: InspectorTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== undefined) {
      event.preventDefault();
      onChange(tabs[nextIndex].id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <nav aria-label="Inspector modes" className="inspector-tabs">
      <div role="tablist" aria-label="Inspector modes" className="tab-list">
        {tabs.map((tab, index) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls="inspector-panel"
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="tab-button"
            >
              <span className={isActive ? 'text-[var(--primary-text)]' : 'text-[var(--muted-text)]'}>
                {tab.label}
              </span>
              {isActive && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-[-1px] h-[2px] bg-[var(--primary-text)]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
