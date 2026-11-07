import React, { useState } from 'react';
import { Edit3, Trash2, Building, GraduationCap } from 'lucide-react';
import type { Organization, Level, Course, SchoolCourse, AssignSchoolCourse } from '../../../types';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import { CourseAutocomplete } from './CourseAutocomplete';

const catalogKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

interface AdminOrgsTabProps {
  organizations: Organization[];
  levels: Level[];
  courses: Course[];
  schoolCourses: SchoolCourse[];
  courseCatalogStatus: 'loading' | 'ready' | 'error';
  newOrgName: string;
  onNewOrgNameChange: (val: string) => void;
  newOrgCode: string;
  onNewOrgCodeChange: (val: string) => void;
  onAddOrg: (e: React.FormEvent) => void;
  onUpdateOrg: (id: string, name: string, code: string) => Promise<void>;
  onToggleOrgActive: (id: string, current: boolean) => Promise<void>;
  onDeleteOrg: (id: string) => Promise<void>;
  onAddCourse: (assignment: AssignSchoolCourse) => Promise<void>;
  onUpdateCourse: (id: string, name: string, code: string) => Promise<void>;
  onRemoveCourse: (assignmentId: string) => Promise<void>;
}

export const AdminOrgsTab: React.FC<AdminOrgsTabProps> = ({
  organizations,
  levels,
  courses,
  schoolCourses,
  courseCatalogStatus,
  newOrgName,
  onNewOrgNameChange,
  newOrgCode,
  onNewOrgCodeChange,
  onAddOrg,
  onUpdateOrg,
  onToggleOrgActive,
  onDeleteOrg,
  onAddCourse,
  onUpdateCourse,
  onRemoveCourse,
}) => {
  const { toast } = useToast();
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const selectedSchool = organizations.find((school) => school.id === selectedSchoolId) ?? organizations[0];
  const schoolLevels = levels.filter((level) => level.organization === selectedSchool?.id);
  // Offer existing level names as templates for schools that have not set them up yet.
  const levelOptions = [...schoolLevels];
  for (const level of levels) {
    if (!levelOptions.some((option) => catalogKey(option.name) === catalogKey(level.name))) {
      levelOptions.push(level);
    }
  }
  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const assignedCourses = schoolCourses.flatMap((assignment) => {
    const course = coursesById.get(assignment.course_id);
    return assignment.school_id === selectedSchool?.id && course ? [{ assignment, course }] : [];
  });

  // Editing Organization State
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgCode, setEditOrgCode] = useState('');

  // Course Form State
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>();
  const [preferredLevelId, setPreferredLevelId] = useState('');
  const [addingCourse, setAddingCourse] = useState(false);
  const selectedLevel = levelOptions.find((level) => level.id === preferredLevelId) ?? levelOptions[0];
  const selectedLevelId = selectedLevel?.id ?? '';
  const levelNamesById = new Map(levels.map((level) => [level.id, catalogKey(level.name)]));
  const chosenLevelName = catalogKey(selectedLevel?.name ?? '');
  const assignedCourseIds = new Set<string>();
  const eligibleCourseIds = new Set<string>();
  for (const assignment of schoolCourses) {
    assignedCourseIds.add(assignment.course_id);
    if (levelNamesById.get(assignment.level) === chosenLevelName) {
      eligibleCourseIds.add(assignment.course_id);
    }
  }
  const searchableCourses = courses.filter((course) => !assignedCourseIds.has(course.id) || eligibleCourseIds.has(course.id));

  // Editing Course State
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editCourseName, setEditCourseName] = useState('');
  const [editCourseCode, setEditCourseCode] = useState('');

  // Confirmation Modal State
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const startEditOrg = (org: Organization) => {
    setEditingOrgId(org.id);
    setEditOrgName(org.name);
    setEditOrgCode(org.code || '');
  };

  const handleSaveOrgEdit = async () => {
    if (!editingOrgId) return;
    try {
      await onUpdateOrg(editingOrgId, editOrgName, editOrgCode);
      toast.success(`School "${editOrgName}" updated`);
      setEditingOrgId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update school');
    }
  };

  const startEditCourse = (c: Course) => {
    setEditingCourseId(c.id);
    setEditCourseName(c.name);
    setEditCourseCode(c.code || '');
  };

  const handleSaveCourseEdit = async () => {
    if (!editingCourseId) return;
    try {
      await onUpdateCourse(editingCourseId, editCourseName, editCourseCode);
      toast.success(`Course "${editCourseName}" updated`);
      setEditingCourseId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update course');
    }
  };

  const selectCourse = (course: Course) => {
    setNewCourseName(course.name);
    setNewCourseCode(course.code ?? '');
    setSelectedCourseId(course.id);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool || !selectedLevelId || addingCourse) return;
    const name = newCourseName.trim();
    const code = newCourseCode.trim();
    if (!name || (!code && !selectedCourseId)) {
      toast.error('Enter a course name and code, or select an existing course.');
      return;
    }
    if (selectedCourseId && !searchableCourses.some((course) => course.id === selectedCourseId)
      && !assignedCourses.some(({ course }) => course.id === selectedCourseId)) {
      toast.error('This course is not available for the selected academic level.');
      return;
    }
    setAddingCourse(true);
    try {
      await onAddCourse({ schoolId: selectedSchool.id, levelId: selectedLevelId, name, code, courseId: selectedCourseId });
      toast.success(`Course assigned to "${selectedSchool.name}".`);
      setNewCourseName('');
      setNewCourseCode('');
      setSelectedCourseId(undefined);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add course');
    } finally {
      setAddingCourse(false);
    }
  };

  const promptDeleteOrg = (org: Organization) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete School: ${org.name}`,
      message: `Are you sure you want to delete "${org.name}" (${org.code || 'ORG'})? This will remove the school profile from the system.`,
      action: async () => {
        try {
          await onDeleteOrg(org.id);
          toast.success(`School "${org.name}" deleted`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete school');
        }
      },
    });
  };

  const promptRemoveCourse = (course: Course, assignmentId: string) => {
    setConfirmModalState({
      isOpen: true,
      title: `Remove Course: ${course.name}`,
      message: `Remove "${course.name}" from "${selectedSchool?.name}"? The shared course and its other school assignments will be kept.`,
      action: async () => {
        try {
          await onRemoveCourse(assignmentId);
          toast.success(`Course "${course.name}" removed from this school.`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to remove course');
        }
      },
    });
  };

  return (
    <div className="space-y-8 animate-enter font-mono text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Schools Management */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A] pb-3 border-b-2 border-[#0A0A0A] mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building className="w-4 h-4 text-[#C9A227]" />
                <span>Client Schools &amp; Institutions</span>
              </span>
              <span className="font-mono text-[10px] bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 font-bold">
                {organizations.length} Active
              </span>
            </h3>

            {/* Create Org Form */}
            <form onSubmit={onAddOrg} className="space-y-3 p-4 bg-[#F8F7F4] border-2 border-[#0A0A0A] mb-5">
              <div>
                <label className="block text-[10px] font-black uppercase mb-1">
                  School Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="University of San Carlos"
                  value={newOrgName}
                  onChange={(e) => onNewOrgNameChange(e.target.value)}
                  className="w-full p-2 bg-white border border-[#0A0A0A] font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase mb-1">
                  School Code / Acronym
                </label>
                <input
                  type="text"
                  placeholder="USC-MAIN"
                  value={newOrgCode}
                  onChange={(e) => onNewOrgCodeChange(e.target.value)}
                  className="w-full p-2 bg-white border border-[#0A0A0A] uppercase font-bold"
                />
              </div>

              <button
                type="submit"
                className="btn-tactile w-full py-2 bg-[#0A0A0A] text-[#C9A227] font-black uppercase tracking-wider cursor-pointer"
              >
                + Register New School
              </button>
            </form>

            {/* Organizations List */}
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {organizations.map((o) => (
                <div
                  key={o.id}
                  className={`relative p-3 border-2 transition-colors ${
                    selectedSchool?.id === o.id
                      ? 'bg-[#0A0A0A] text-[#C9A227] border-[#C9A227]'
                      : o.is_active !== false
                      ? 'bg-white border-[#0A0A0A]'
                      : 'bg-neutral-100 border-neutral-300 opacity-60'
                  }`}
                >
                  {editingOrgId === o.id ? (
                    <div className="space-y-2 bg-[#F8F7F4] p-2.5 border border-[#0A0A0A] text-[#0A0A0A]">
                      <div className="text-[10px] font-black uppercase text-[#9A7816]">Editing School</div>
                      <div>
                        <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                          School Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editOrgName}
                          onChange={(e) => setEditOrgName(e.target.value)}
                          className="w-full p-1.5 border border-[#0A0A0A] bg-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                          School Code / Acronym
                        </label>
                        <input
                          type="text"
                          value={editOrgCode}
                          onChange={(e) => setEditOrgCode(e.target.value)}
                          className="w-full p-1.5 border border-[#0A0A0A] bg-white font-mono font-bold uppercase"
                        />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingOrgId(null)}
                          className="btn-tactile px-2.5 py-1 bg-white border border-[#0A0A0A] font-bold uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveOrgEdit}
                          className="btn-tactile px-3 py-1 bg-[#0A0A0A] text-[#C9A227] font-black uppercase border border-[#0A0A0A] cursor-pointer"
                        >
                          ✓ Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={selectedSchool?.id === o.id}
                        onClick={() => {
                          if (o.id === selectedSchool?.id) return;
                          setSelectedSchoolId(o.id);
                          setPreferredLevelId('');
                          setEditingCourseId(null);
                        }}
                        className="min-w-0 text-left cursor-pointer before:absolute before:inset-0"
                      >
                        <span className="font-bold uppercase block text-sm wrap-break-word">{o.name}</span>
                        <span className={`font-mono text-[10px] px-1.5 py-0.5 uppercase inline-block mt-1 ${
                          selectedSchool?.id === o.id ? 'bg-[#C9A227] text-[#0A0A0A]' : 'bg-[#0A0A0A] text-[#C9A227]'
                        }`}>
                          {o.code || 'ORG'}
                        </span>
                      </button>
                      <div className="relative flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleOrgActive(o.id, o.is_active !== false)}
                          className={`px-2 py-0.5 text-[10px] font-bold uppercase border cursor-pointer ${
                            o.is_active !== false
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                              : 'bg-neutral-200 text-neutral-600 border-neutral-400'
                          }`}
                        >
                          {o.is_active !== false ? 'Active' : 'Archived'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditOrg(o)}
                          className="p-1 bg-white text-[#0A0A0A] border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                          title="Edit School"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDeleteOrg(o)}
                          className="p-1 bg-white text-red-600 border border-neutral-300 hover:border-red-600 hover:bg-red-50 cursor-pointer"
                          title="Delete School"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: COURSES & ACADEMIC LEVELS (T019) */}
        {/* Courses Management */}
        <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#0A0A0A] pb-3 border-b-2 border-[#0A0A0A] mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#C9A227]" />
                <span>Degree Programs &amp; Courses</span>
              </span>
              <span className="font-mono text-[10px] bg-[#0A0A0A] text-[#C9A227] px-2 py-0.5 font-bold">
                {assignedCourses.length} Courses
              </span>
            </h3>

            <div className="mb-3 border-l-4 border-[#C9A227] bg-[#F8F7F4] p-3" aria-live="polite">
              <p><strong>SELECTED SCHOOL:</strong> {selectedSchool?.name ?? 'No school selected'}</p>
              {selectedSchool && <p><strong>SCHOOL CODE:</strong> {selectedSchool.code || '—'}</p>}
            </div>

            {/* Create Course Form */}
            <form onSubmit={handleCreateCourse} className="p-4 bg-[#F8F7F4] border-2 border-[#0A0A0A] mb-5">
              <fieldset disabled={!selectedSchool || !selectedLevelId || addingCourse} className="min-w-0 space-y-3 disabled:opacity-60">
                <div>
                  <label htmlFor="new-course-level" className="block text-[10px] font-black uppercase mb-1">
                    Target Academic Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="new-course-level"
                    value={selectedLevelId}
                    onChange={(e) => setPreferredLevelId(e.target.value)}
                    className="w-full p-2 bg-white border border-[#0A0A0A] font-bold"
                  >
                    {!levelOptions.length && <option value="">No academic levels available</option>}
                    {levelOptions.map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                    ))}
                  </select>
                </div>

                <div className="relative grid grid-cols-2 gap-2">
                  <CourseAutocomplete
                    field="name"
                    value={newCourseName}
                    courses={searchableCourses}
                    status={courseCatalogStatus}
                    onChange={(value) => {
                      setSelectedCourseId(undefined);
                      setNewCourseName(value);
                    }}
                    onSelect={selectCourse}
                  />
                  <CourseAutocomplete
                    field="code"
                    value={newCourseCode}
                    courses={searchableCourses}
                    status={courseCatalogStatus}
                    onChange={(value) => {
                      setSelectedCourseId(undefined);
                      setNewCourseCode(value);
                    }}
                    onSelect={selectCourse}
                  />
                </div>
                <p className="text-[10px] text-neutral-600" role="status">
                  {courseCatalogStatus === 'loading' ? 'Loading course catalog…'
                    : courseCatalogStatus === 'error' ? 'Could not load the course catalog. Refresh to try again.'
                    : selectedCourseId ? 'Existing course selected.'
                    : 'Search by course name or code, or enter both to add a new course.'}
                </p>

                <button
                  type="submit"
                  className="btn-tactile w-full py-2 bg-[#0A0A0A] text-[#C9A227] font-black uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed"
                >
                  {addingCourse ? 'Assigning Course…' : '+ Add Degree Program'}
                </button>
              </fieldset>
            </form>

            {/* Courses By Level List */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {selectedSchool && !assignedCourses.length && (
                <p className="text-neutral-600">No degree programs assigned to this school</p>
              )}
              {schoolLevels.map((lvl) => {
                const lvlCourses = assignedCourses.filter(({ assignment }) => assignment.level === lvl.id);
                if (!lvlCourses.length) return null;
                return (
                  <div key={lvl.id} className="border border-neutral-300 p-2.5 bg-[#F8F7F4]">
                    <div className="font-black text-[11px] uppercase text-[#0A0A0A] pb-1 border-b border-neutral-300 mb-2 flex justify-between">
                      <span>{lvl.name}</span>
                      <span className="text-[#9A7816] font-mono">{lvlCourses.length} Courses</span>
                    </div>

                    <div className="space-y-1.5">
                      {lvlCourses.map(({ assignment, course: c }) => (
                          <div
                            key={c.id}
                            className="p-2 bg-white border border-neutral-300 flex justify-between items-center"
                          >
                            {editingCourseId === c.id ? (
                              <div className="w-full space-y-2 p-1 bg-[#F8F7F4] border border-[#0A0A0A]">
                                <div className="text-[10px] font-black uppercase text-[#9A7816]">Editing Course</div>
                                <p className="text-[10px] text-neutral-600">Changes update the shared course for every school that uses it.</p>
                                <div>
                                  <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                                    Course Name <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={editCourseName}
                                    onChange={(e) => setEditCourseName(e.target.value)}
                                    className="w-full p-1 border border-[#0A0A0A] bg-white font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                                    Course Code / Acronym
                                  </label>
                                  <input
                                    type="text"
                                    value={editCourseCode}
                                    onChange={(e) => setEditCourseCode(e.target.value)}
                                    className="w-full p-1 border border-[#0A0A0A] uppercase bg-white font-bold"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCourseId(null)}
                                    className="btn-tactile px-2.5 py-1 bg-white border border-[#0A0A0A] font-bold uppercase cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveCourseEdit}
                                    className="btn-tactile px-3 py-1 bg-[#0A0A0A] text-[#C9A227] font-black uppercase border border-[#0A0A0A] cursor-pointer"
                                  >
                                    ✓ Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div>
                                  <span className="font-bold text-[#0A0A0A] uppercase">{c.name}</span>
                                  {c.code && (
                                    <span className="font-mono font-black text-[#9A7816] ml-2 text-[10px]">
                                      ({c.code})
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditCourse(c)}
                                    className="p-1 border border-neutral-300 hover:bg-neutral-100 cursor-pointer"
                                    title="Edit Course"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => promptRemoveCourse(c, assignment.id)}
                                    className="p-1 text-red-600 border border-neutral-300 hover:border-red-600 hover:bg-red-50 cursor-pointer"
                                    title="Remove Course from School"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText="Confirm Delete"
        isDestructive={true}
        onConfirm={confirmModalState.action}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
