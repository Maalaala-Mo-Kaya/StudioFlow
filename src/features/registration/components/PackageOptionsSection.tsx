import React from 'react';
import type { Gender, PackageOptionGroup } from '../../../types';
import { PackageOptionsPicker } from '../../../components/common/PackageOptionsPicker';
import type { OptionPicks } from '../../../utils/packageOptions';
import { validationProps, type RegistrationErrors } from '../registrationValidation';

interface PackageOptionsSectionProps {
  packageName: string;
  groups: PackageOptionGroup[];
  gender: Gender | '';
  picks: OptionPicks;
  onChange: (picks: OptionPicks) => void;
  errors: RegistrationErrors;
}

/** Shown when the chosen package has options: the client picks what they like (included in the price). */
export const PackageOptionsSection: React.FC<PackageOptionsSectionProps> = ({ packageName, groups, gender, picks, onChange, errors }) => {
  if (!groups.length) return null;
  return (
    <section aria-labelledby="sec-package-options">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-5">
        <h2 id="sec-package-options" className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0">
          <span className="font-mono text-gold-soft mr-2">03A //</span>
          Package Options
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">Included in {packageName}</span>
      </div>
      {/* Focus target for the "choose your options" error. */}
      <div {...validationProps('package_options', errors.package_options)} tabIndex={-1} className="outline-none">
        {gender ? (
          <PackageOptionsPicker groups={groups} gender={gender} picks={picks} onChange={onChange} error={errors.package_options} />
        ) : (
          <p className="p-3 border border-dashed border-neutral-400 text-xs text-neutral-600 font-sans">
            Select the client's gender above to see the options for this package.
          </p>
        )}
      </div>
    </section>
  );
};
