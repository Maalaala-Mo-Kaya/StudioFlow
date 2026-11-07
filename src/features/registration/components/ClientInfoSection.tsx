import React from 'react';
import type { Organization, Level, Course } from '../../../types';

interface ClientInfoSectionProps {
  familyName: string;
  onFamilyNameChange: (value: string) => void;
  givenName: string;
  onGivenNameChange: (value: string) => void;
  middleName: string;
  onMiddleNameChange: (value: string) => void;
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
}

export const ClientInfoSection: React.FC<ClientInfoSectionProps> = ({
  familyName,
  onFamilyNameChange,
  givenName,
  onGivenNameChange,
  middleName,
  onMiddleNameChange,
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
}) => {
  return (
    <section aria-labelledby="sec-client-info">
      <div className="flex items-center justify-between pb-2.5 border-b-2 border-[#0A0A0A] mb-5">
        <h2
          id="sec-client-info"
          className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-[#0A0A0A] m-0"
        >
          <span className="font-mono text-[#9A7816] mr-2">01 //</span>
          Client Information
        </h2>
        <span className="font-mono text-[10px] text-neutral-500 uppercase">Required *</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Family Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="DELA CRUZ"
            value={familyName}
            onChange={(e) => onFamilyNameChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition"
          />
        </div>
        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Given Name <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="JUAN"
            value={givenName}
            onChange={(e) => onGivenNameChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition"
          />
        </div>
        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Middle Name
          </label>
          <input
            type="text"
            placeholder="SANTOS"
            value={middleName}
            onChange={(e) => onMiddleNameChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div>
          <label htmlFor="registration-school" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            School - Campus / Organization
          </label>
          <select
            id="registration-school"
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold"
          >
            {!organizations.length && <option value="">No schools available</option>}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="registration-level" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Department / Academic Level
          </label>
          <select
            id="registration-level"
            value={selectedLevelId}
            onChange={(e) => onLevelChange(e.target.value)}
            disabled={!levels.length}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold"
          >
            {!levels.length && <option value="">{schoolCatalogLoading ? 'Loading academic levels…' : 'No academic levels available'}</option>}
            {levels.map((lvl) => (
              <option key={lvl.id} value={lvl.id}>
                {lvl.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <div className="sm:col-span-2">
          <label htmlFor="registration-course" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Full Name of Course / Strand
          </label>
          <select
            id="registration-course"
            value={selectedCourseId}
            onChange={(e) => onCourseChange(e.target.value)}
            disabled={!courses.length}
            required={courses.length > 0}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold"
          >
            <option value="">
              {schoolCatalogLoading ? 'Loading courses…'
                : schoolCatalogFailed ? 'Could not load courses. Refresh to retry.'
                : courses.length ? 'Select a course or strand'
                : 'No courses assigned for this school and level'}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Section (If any)
          </label>
          <input
            type="text"
            placeholder="4-A"
            value={section}
            onChange={(e) => onSectionChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white font-bold"
          />
        </div>
      </div>
    </section>
  );
};
