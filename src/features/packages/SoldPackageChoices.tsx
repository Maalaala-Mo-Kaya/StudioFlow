import type { Registration } from '../../types';
import { formatCurrency } from '../../utils/formatters';

export function SoldPackageChoices({ registration, showPrice = false }: { registration: Registration; showPrice?: boolean }) {
  const selections = registration.package_snapshot?.configuration?.selections;
  if (!selections?.length) return null;
  return <div className="space-y-1 text-xs">
    <p className="font-bold">Package choices</p>
    <ul className="space-y-1">
      {selections.map((item) => (
        <li key={item.section + ':' + item.choice} className="flex flex-wrap justify-between gap-x-2 wrap-break-word">
          <span>{item.sectionTitle} · {item.name}</span>
          {showPrice && <span className="font-bold">{item.amount > 0 ? `+${formatCurrency(item.amount, { exact: true })}` : 'Included'}</span>}
        </li>
      ))}
    </ul>
  </div>;
}
