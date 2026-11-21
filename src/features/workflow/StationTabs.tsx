import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export function StationTabs<Id extends string>({ label, tabs, active, onChange, children }: {
  label: string;
  tabs: readonly { id: Id; label: string; count?: number }[];
  active: Id;
  onChange: (id: Id) => void;
  children: ReactNode;
}) {
  const id = useId();
  const panel = `${id}-panel`;
  const tabId = (value: Id) => `${id}-tab-${value}`;

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + last) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(tabId(tabs[next].id))?.focus();
  }

  return (
    <div className="min-w-0 space-y-3">
      <div role="tablist" aria-label={label} className="grid grid-cols-2 gap-1.5 border border-line bg-panel p-1.5 sm:flex sm:flex-wrap">
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button key={tab.id} id={tabId(tab.id)} type="button" role="tab" aria-controls={panel}
              aria-label={tab.label} aria-describedby={tab.count !== undefined ? `${tabId(tab.id)}-count` : undefined}
              aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.id)}
              onKeyDown={(event) => move(event, index)}
              className={`btn-tactile flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 border-2 px-2 py-2 text-xs font-black uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-gold sm:px-4 ${
                selected ? 'border-gold bg-gold text-on-gold shadow-lux-gold' : 'border-line bg-obsidian text-gold hover:border-gold'
              }`}>
              <span>{tab.label}</span>
              {tab.count !== undefined && <span id={`${tabId(tab.id)}-count`} className={`shrink-0 px-1.5 py-0.5 font-mono text-[10px] ${
                selected ? 'bg-obsidian text-gold' : 'bg-obsidian-2 text-gold'
              }`}>{tab.count}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panel} aria-labelledby={tabId(active)} tabIndex={0}
        className="min-w-0 space-y-3 focus-visible:outline-2 focus-visible:outline-gold">
        {children}
      </div>
    </div>
  );
}
