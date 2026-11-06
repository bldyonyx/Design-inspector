import { Asterisk } from 'lucide-react';

export function PopupHeader() {
  return (
    <header>
      <div className="popup-header">
        <div className="popup-header-copy">
          <p className="editorial-label mb-2">CREATIVE TOOLS — NO. 01</p>
          <h1 className="popup-title font-editorial">
            design inspector<span className="text-[var(--muted-text)]">.</span>
          </h1>
          <p className="popup-subtitle">
            a little tool for curious designers.
          </p>
        </div>
        <Asterisk
          aria-hidden="true"
          className="header-asterisk"
          strokeWidth={1.4}
        />
      </div>
      <div aria-hidden="true" className="polka-strip h-[10px]" />
    </header>
  );
}
