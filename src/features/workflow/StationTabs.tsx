import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export function StationTabs<Id extends string>({ label, tabs, active, onChange, toolbar, variant = 'default', children }: {
  label: string;
  tabs: readonly { id: Id; label: string; count?: number }[];
  active: Id;
  onChange: (id: Id) => void;
  toolbar?: ReactNode;
  variant?: 'default' | 'underline';
  children: ReactNode;
}) {
  const id = useId();
  const panel = `${id}-panel`;
  const tabId = (value: Id) => `${id}-tab-${value}`;
  const underline = variant === 'underline';

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

  const tabList = (
    <div role="tablist" aria-label={label} className={underline
      ? 'flex min-w-0 flex-wrap gap-1'
      : 'grid grid-cols-2 gap-1.5 border border-line bg-panel p-1.5 sm:flex sm:flex-wrap'}>
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button key={tab.id} id={tabId(tab.id)} type="button" role="tab" aria-controls={panel}
            aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={`flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 px-2 py-2 text-xs font-black uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-gold sm:px-4 ${
              underline ? `border-b-2 motion-safe:transition-colors ${selected ? 'border-gold bg-gold-wash text-ink' : 'border-transparent text-ink/75 hover:bg-gold-wash hover:text-ink'}`
                : `btn-tactile flex-1 border-2 ${selected ? 'border-gold bg-gold text-on-gold shadow-lux-gold' : 'border-line bg-obsidian text-gold-soft hover:border-gold'}`
            }`}>
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[10px] text-gold-soft ${
              selected ? 'bg-obsidian' : 'bg-obsidian-2'
            }`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={underline ? '@container min-w-0' : 'min-w-0 space-y-3'}>
      {underline ? (
        <div className="flex flex-col gap-2 border-b border-line px-3 py-2 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between sm:px-4">
          {tabList}
          {toolbar}
        </div>
      ) : tabList}
      <div role="tabpanel" id={panel} aria-labelledby={tabId(active)} tabIndex={0}
        className={`min-w-0 space-y-3 focus-visible:outline-2 focus-visible:outline-gold ${underline ? 'p-3 sm:p-4' : ''}`}>
        {children}
      </div>
    </div>
  );
}
