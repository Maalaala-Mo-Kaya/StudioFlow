import React from 'react';
import type { Organization, Level, Course } from '../../../types';
import { validationProps, type RegistrationErrors } from '../registrationValidation';
import { RegistrationFieldError } from './RegistrationFieldError';

const invalidBorder = 'aria-invalid:border-red-600 aria-invalid:focus:border-red-600';

interface ClientInfoSectionProps {
  familyName: string;
  onFamilyNameChange: (value: string) => void;
  givenName: string;
  onGivenNameChange: (value: string) => void;
  middleName: string;
  onMiddleNameChange: (value: string) => void;
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
}

export const ClientInfoSection: React.FC<ClientInfoSectionProps> = ({
  familyName,
  onFamilyNameChange,
  givenName,
  onGivenNameChange,
  middleName,
  onMiddleNameChange,
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
          <label htmlFor="registration-family_name" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Family Name <span className="text-red-600">*</span>
          </label>
          <input
            {...validationProps('family_name', errors.family_name)}
            type="text"
            required
            placeholder="DELA CRUZ"
            value={familyName}
            onChange={(e) => onFamilyNameChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition ${invalidBorder}`}
          />
          <RegistrationFieldError field="family_name" errors={errors} />
        </div>
        <div>
          <label htmlFor="registration-given_name" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Given Name <span className="text-red-600">*</span>
          </label>
          <input
            {...validationProps('given_name', errors.given_name)}
            type="text"
            required
            placeholder="JUAN"
            value={givenName}
            onChange={(e) => onGivenNameChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition ${invalidBorder}`}
          />
          <RegistrationFieldError field="given_name" errors={errors} />
        </div>
        <div>
          <label htmlFor="registration-middle_name" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Middle Name
          </label>
          <input
            id="registration-middle_name"
            type="text"
            placeholder="SANTOS"
            value={middleName}
            onChange={(e) => onMiddleNameChange(e.target.value)}
            className="w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-[#F8F7F4] focus:bg-white uppercase font-bold transition"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <label className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider">
          Student ID <span className="font-normal normal-case">(optional)</span>
          <input value={studentId} onChange={(event) => onStudentIdChange(event.target.value)} maxLength={80}
            className="block w-full mt-1.5 min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 bg-[#F8F7F4] focus:bg-white font-bold" />
        </label>
        <div>
          <label htmlFor="registration-organization" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            School / Campus / Organization <span className="text-red-600">*</span>
          </label>
          <select
            {...validationProps('organization', errors.organization)}
            required
            value={selectedOrgId}
            onChange={(e) => onOrgChange(e.target.value)}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold ${invalidBorder}`}
          >
            <option value="">{organizations.length ? 'Select a school' : 'No schools available'}</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <RegistrationFieldError field="organization" errors={errors} />
        </div>

        <div>
          <label htmlFor="registration-level" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Department / Academic Level <span className="text-red-600">*</span>
          </label>
          <select
            {...validationProps('level', errors.level)}
            required
            value={selectedLevelId}
            onChange={(e) => onLevelChange(e.target.value)}
            disabled={!levels.length}
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold ${invalidBorder}`}
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
          <label htmlFor="registration-course" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Full Name of Course / Strand <span className="text-red-600">*</span>
          </label>
          <select
            {...validationProps('course', errors.course)}
            value={selectedCourseId}
            onChange={(e) => onCourseChange(e.target.value)}
            disabled={!courses.length}
            required
            className={`w-full min-h-[48px] text-sm px-3.5 py-2.5 border border-neutral-400 focus:border-[#0A0A0A] bg-white font-bold ${invalidBorder}`}
          >
            <option value="">
              {schoolCatalogLoading ? 'Loading courses…'
                : schoolCatalogFailed ? 'Could not load courses. Refresh to retry.'
                : !selectedLevelId ? 'Select an academic level first'
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
          <RegistrationFieldError field="course" errors={errors} />
        </div>

        <div>
          <label htmlFor="registration-section" className="block text-[11px] font-black text-[#0A0A0A] uppercase tracking-wider mb-1.5">
            Section (If any)
          </label>
          <input
            id="registration-section"
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
