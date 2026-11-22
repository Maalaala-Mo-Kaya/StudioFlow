import React from 'react';
import type { Organization, Level, Course } from '../../../types';
import { genderOptions, registrationNameLimit, validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';
import { SearchableSelect } from '../../../components/common/SearchableSelect';

const invalidBorder = 'aria-invalid:border-red-600 aria-invalid:focus:border-red-600';

interface ClientInfoSectionProps {
  familyName: string;
  onFamilyNameChange: (value: string) => void;
  givenName: string;
  onGivenNameChange: (value: string) => void;
  middleName: string;
  onMiddleNameChange: (value: string) => void;
  gender: string;
  onGenderChange: (value: string) => void;
  studentId: string;
  onStudentIdChange: (value: string) => void;
  organizations: Organization[];
  selectedOrgId: string;
  onOrgChange: (value: string) => void;
  levels: Level[];
  selectedLevelId: string;
  onLevelChange: (value: string) => void;
  courses: Course[];
  schoolCatalogLoading: boolean;
  schoolCatalogFailed: boolean;
  selectedCourseId: string;
  onCourseChange: (value: string) => void;
  section: string;
  onSectionChange: (value: string) => void;
  errors: RegistrationErrors;
  /** False for walk-in clients: only the name fields are shown. */
  showSchool?: boolean;
  /** Kiosk steps: "person" = names (and gender), "school" = student ID, school, level, course, section. */
  part?: 'person' | 'school' | 'all';
  /** False when the gender is asked with the package options (an earlier kiosk step). */
  showGender?: boolean;
}

export const ClientInfoSection: React.FC<ClientInfoSectionProps> = ({
  familyName,
  onFamilyNameChange,
  givenName,
  onGivenNameChange,
  middleName,
  onMiddleNameChange,
  gender,
  onGenderChange,
  studentId,
  onStudentIdChange,
  organizations,
  selectedOrgId,
  onOrgChange,
  levels,
  selectedLevelId,
  onLevelChange,
  courses,
  schoolCatalogLoading,
  schoolCatalogFailed,
  selectedCourseId,
  onCourseChange,
  section,
  onSectionChange,
  errors,
  showSchool = true,
  part = 'all',
  showGender = true,
}) => {
  return (
    <section aria-labelledby="sec-client-info">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-line mb-5">
        <h2
          id="sec-client-info"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink m-0"
        >
          {part === 'school' ? 'School details' : part === 'person' ? 'About you' : 'Client Information'}
        </h2>
        <span id="registration-name-limit" className="font-mono text-[10px] text-neutral-500">
          Up to {registrationNameLimit} characters per name field
        </span>
      </div>

      {part !== 'school' && (<>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="registration-family_name" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Family Name <span className="text-red-600">*</span>
          </label>
          <input
            {...validationProps('family_name', errors.family_name)}
            aria-describedby={errors.family_name ? 'registration-family_name-error registration-name-limit' : 'registration-name-limit'}
            type="text"
            required
            placeholder="DELA CRUZ"
            value={familyName}
            onChange={(e) => onFamilyNameChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel uppercase font-bold transition ${invalidBorder}`}
          />
          <RegistrationFieldError field="family_name" errors={errors} />
        </div>
        <div>
          <label htmlFor="registration-given_name" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Given Name <span className="text-red-600">*</span>
          </label>
          <input
            {...validationProps('given_name', errors.given_name)}
            aria-describedby={errors.given_name ? 'registration-given_name-error registration-name-limit' : 'registration-name-limit'}
            type="text"
            required
            placeholder="JUAN"
            value={givenName}
            onChange={(e) => onGivenNameChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel uppercase font-bold transition ${invalidBorder}`}
          />
          <RegistrationFieldError field="given_name" errors={errors} />
        </div>
        <div>
          <label htmlFor="registration-middle_name" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Middle Name
          </label>
          <input
            {...validationProps('middle_name', errors.middle_name)}
            aria-describedby={errors.middle_name ? 'registration-middle_name-error registration-name-limit' : 'registration-name-limit'}
            type="text"
            placeholder="SANTOS"
            value={middleName}
            onChange={(e) => onMiddleNameChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel uppercase font-bold transition ${invalidBorder}`}
          />
          <RegistrationFieldError field="middle_name" errors={errors} />
        </div>
      </div>

      {showGender && <div className="mt-4 max-w-sm">
        <label htmlFor="registration-gender" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
          Gender <span className="text-red-600">*</span>
        </label>
        <select
          {...validationProps('gender', errors.gender)}
          required
          value={gender}
          onChange={(event) => onGenderChange(event.target.value)}
          className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-panel font-bold ${invalidBorder}`}
        >
          <option value="">Select gender</option>
          {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <RegistrationFieldError field="gender" errors={errors} />
      </div>}
      </>)}

      {part !== 'person' && showSchool && (<>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${part === 'school' ? '' : 'mt-4'}`}>
        <label className="block text-[11px] font-black text-ink uppercase tracking-wider">
          Student ID <span className="font-normal normal-case">(optional)</span>
          <input value={studentId} onChange={(event) => onStudentIdChange(event.target.value)} maxLength={80}
            className="block w-full mt-1.5 min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 bg-canvas focus:bg-panel font-bold" />
        </label>
        <div>
          <label htmlFor="registration-organization" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            School / Campus / Organization <span className="text-red-600">*</span>
          </label>
          {/* Type to filter by school name or code (e.g. "san carlos" or "USC"). */}
          <SearchableSelect
            {...validationProps('organization', errors.organization)}
            value={selectedOrgId}
            onChange={onOrgChange}
            disabled={!organizations.length}
            options={organizations.map((org) => ({ value: org.id, label: org.name, keywords: org.code }))}
            placeholder={organizations.length ? 'Type to search your school' : 'No schools available'}
            emptyText="No school matches. Check the spelling or try the school code."
            className={`w-full min-h-[48px] text-sm py-2.5 border border-neutral-400 focus:border-line bg-panel font-bold disabled:opacity-60 ${invalidBorder}`}
          />
          <RegistrationFieldError field="organization" errors={errors} />
        </div>

        <div>
          <label htmlFor="registration-level" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Department / Academic Level <span className="text-red-600">*</span>
          </label>
          <select
            {...validationProps('level', errors.level)}
            required
            value={selectedLevelId}
            onChange={(e) => onLevelChange(e.target.value)}
            disabled={!levels.length}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-panel font-bold ${invalidBorder}`}
          >
            <option value="">
              {!selectedOrgId ? 'Select a school first'
                : schoolCatalogLoading ? 'Loading academic levels…'
                : schoolCatalogFailed ? 'Could not load academic levels. Refresh to retry.'
                : levels.length ? 'Select an academic level' : 'No academic levels available'}
            </option>
            {levels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.name}
              </option>
            ))}
          </select>
          <RegistrationFieldError field="level" errors={errors} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <div className="sm:col-span-2">
          <label htmlFor="registration-course" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Course / Strand / Grade <span className="text-red-600">*</span>
          </label>
          {/* Type to filter by course name or code (e.g. "acc" or "BSA"); only listed courses can be chosen. */}
          <SearchableSelect
            {...validationProps('course', errors.course)}
            value={selectedCourseId}
            onChange={onCourseChange}
            disabled={!courses.length}
            options={courses.map((c) => ({ value: c.id, label: c.code ? `${c.code} — ${c.name}` : c.name, keywords: c.code }))}
            placeholder={schoolCatalogLoading ? 'Loading courses…'
              : schoolCatalogFailed ? 'Could not load courses. Refresh to retry.'
              : !selectedLevelId ? 'Select an academic level first'
              : courses.length ? 'Type to search, e.g. "accountancy" or "BSA"'
              : 'No courses assigned for this school and level'}
            emptyText="No course matches. Check the spelling or try the course code."
            className={`w-full min-h-[48px] text-sm py-2.5 border border-neutral-400 focus:border-line bg-panel font-bold disabled:opacity-60 ${invalidBorder}`}
          />
          <RegistrationFieldError field="course" errors={errors} />
        </div>

        <div>
          <label htmlFor="registration-section" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
            Section (If any)
          </label>
          <input
            id="registration-section"
            type="text"
            placeholder="4-A"
            value={section}
            onChange={(e) => onSectionChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-line bg-canvas focus:bg-panel font-bold"
          />
        </div>
      </div>
      </>)}
    </section>
  );
};
