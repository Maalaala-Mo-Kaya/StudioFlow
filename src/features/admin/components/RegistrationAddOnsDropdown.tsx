import type { RegistrationAddOn } from '../../../types';

interface RegistrationAddOnsDropdownProps {
  addOns: RegistrationAddOn[];
  formatAmount: (amount: number) => string;
  className?: string;
}

export function RegistrationAddOnsDropdown({
  addOns,
  formatAmount,
  className = '',
}: RegistrationAddOnsDropdownProps) {
  if (addOns.length === 0) return <>—</>;

  return (
    <details className={className}>
      <summary className="cursor-pointer text-[10px] font-bold whitespace-nowrap">
        {addOns.length} add-on{addOns.length === 1 ? '' : 's'}
      </summary>
      <ul className="mt-1 min-w-64 space-y-1 text-[10px] text-neutral-600">
        {addOns.map((item, index) => (
          <li key={item.id ?? index} className="flex justify-between gap-3">
            <span>{item.name || item.code || 'Add-on'}</span>
            <span className="shrink-0 whitespace-nowrap">{formatAmount(item.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
