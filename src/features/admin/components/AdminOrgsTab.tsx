import React, { useState } from 'react';
import { BookOpen, Building, GraduationCap } from 'lucide-react';
import { RecordActionButton, recordActionGroup } from '../../../components/common/RecordActionButton';
import { Modal } from '../../../components/common/Modal';
import type { Organization, Level, Course, SchoolCourse, AssignSchoolCourse } from '../../../types';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import { CourseAutocomplete } from './CourseAutocomplete';
import { CourseQuickAdd, type QuickAddChoice } from './CourseQuickAdd';
import { catalogForLevel, STANDARD_LEVELS } from '../../../constants/courseCatalog';

const catalogKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const OTHER_LEVEL = 'other';

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
  /** Registers the school; resolves to its id (undefined when it failed). */
  onAddOrg: (e: React.FormEvent) => Promise<string | undefined>;
  onUpdateOrg: (id: string, name: string, code: string, askLook: boolean) => Promise<void>;
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
  const [editOrgAskLook, setEditOrgAskLook] = useState(true);

  // Course Form State
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseCode, setNewCourseCode] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<string>();
  // The level choice is an existing level id, `new:<standard name>`, or OTHER_LEVEL (typed name).
  const [preferredLevelId, setPreferredLevelId] = useState('');
  const [customLevelName, setCustomLevelName] = useState('');
  const [addingCourse, setAddingCourse] = useState(false);
  const newLevelChoices = STANDARD_LEVELS.filter((name) =>
    !levelOptions.some((option) => catalogKey(option.name) === catalogKey(name)));
  const levelChoice = preferredLevelId
    || (levelOptions[0]?.id ?? (newLevelChoices.includes('College') ? 'new:College' : OTHER_LEVEL));
  // A new level picked earlier becomes a real level after the first course is added to it.
  // A level borrowed from another school becomes this school's own level (same name) once its
  // first course is added; follow it by name so the choice survives the refresh.
  const chosenTemplate = levels.find((level) => level.id === levelChoice);
  const choiceName = levelChoice.startsWith('new:') ? levelChoice.slice(4) : chosenTemplate?.name;
  const selectedLevel = levelOptions.find((level) => level.id === levelChoice)
    ?? (choiceName !== undefined
      ? levelOptions.find((level) => catalogKey(level.name) === catalogKey(choiceName))
      : undefined);
  const selectedLevelId = selectedLevel?.id ?? '';
  const selectedLevelName = selectedLevel?.name
    ?? (levelChoice.startsWith('new:') ? levelChoice.slice(4) : customLevelName.trim().replace(/\s+/g, ' '));
  // What the server needs to find or create this school's level.
  const levelTarget = selectedLevelId ? { levelId: selectedLevelId } : { levelName: selectedLevelName };
  const levelReady = !!selectedLevelId || !!selectedLevelName;
  const levelNamesById = new Map(levels.map((level) => [level.id, catalogKey(level.name)]));
  const chosenLevelName = catalogKey(selectedLevelName);
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
    setEditOrgAskLook(!org.makeup_look_off);
  };

  const handleSaveOrgEdit = async () => {
    if (!editingOrgId) return;
    try {
      await onUpdateOrg(editingOrgId, editOrgName, editOrgCode, editOrgAskLook);
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
    if (!selectedSchool || addingCourse) return;
    if (!levelReady) {
      toast.error('Type the name of the academic level first.');
      return;
    }
    const name = newCourseName.trim();
    const code = newCourseCode.trim();
    if (!name || (!code && !selectedCourseId)) {
      toast.error('Enter the course name and its acronym, or select an existing course.');
      return;
    }
    if (selectedCourseId && !searchableCourses.some((course) => course.id === selectedCourseId)
      && !assignedCourses.some(({ course }) => course.id === selectedCourseId)) {
      toast.error('This course is not available for the selected academic level.');
      return;
    }
    setAddingCourse(true);
    try {
      await onAddCourse({ schoolId: selectedSchool.id, ...levelTarget, name, code, courseId: selectedCourseId });
      toast.success(`${code || name} added to ${selectedSchool.code || selectedSchool.name}.`);
      setNewCourseName('');
      setNewCourseCode('');
      setSelectedCourseId(undefined);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add course');
    } finally {
      setAddingCourse(false);
    }
  };

  // One-click add from the built-in course list (reuses the course record when it already exists).
  const quickAddCourse = async ({ courseId, name, code }: QuickAddChoice) => {
    if (!selectedSchool || !levelReady) return;
    try {
      await onAddCourse({ schoolId: selectedSchool.id, ...levelTarget, name, code, courseId });
      toast.success(`${code || name} added to ${selectedSchool.code || selectedSchool.name}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add course');
    }
  };

  // A newly registered school becomes the selected one, so its first course goes to it.
  const handleRegisterSchool = async (e: React.FormEvent) => {
    const id = await onAddOrg(e);
    if (!id) return;
    setSelectedSchoolId(id);
    setPreferredLevelId('');
    setCustomLevelName('');
    setEditingCourseId(null);
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
        <div className="bg-panel border-2 border-line shadow-lux p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-3 border-b-2 border-line mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Building className="w-4 h-4 text-gold" />
                <span>Client Schools &amp; Institutions</span>
              </span>
              <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
                {organizations.length} Active
              </span>
            </h3>

            {/* Create Org Form */}
            <form onSubmit={handleRegisterSchool} className="space-y-3 p-4 bg-canvas border-2 border-line mb-5">
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
                  className="w-full p-2 bg-panel border border-line font-semibold"
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
                  className="w-full p-2 bg-panel border border-line uppercase font-bold"
                />
              </div>

              <button
                type="submit"
                className="btn-tactile w-full py-2 bg-obsidian text-gold font-black uppercase tracking-wider cursor-pointer"
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
                      ? 'bg-obsidian text-gold border-gold'
                      : o.is_active !== false
                      ? 'bg-panel border-line'
                      : 'bg-neutral-100 border-neutral-300 opacity-60'
                  }`}
                >
                    <div className="flex flex-wrap justify-between items-center gap-2">
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
                          selectedSchool?.id === o.id ? 'bg-gold text-on-gold' : 'bg-obsidian text-gold'
                        }`}>
                          {o.code || 'ORG'}
                        </span>
                        {o.makeup_look_off && (
                          <span className="ml-1.5 font-mono text-[9px] px-1.5 py-0.5 uppercase inline-block border border-neutral-400 text-neutral-500"
                            title="The kiosk does not ask this school's students for a preferred makeup look">
                            No look
                          </span>
                        )}
                      </button>
                      <div className="relative ml-auto flex flex-wrap items-center justify-end gap-2">
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
                        <span className={recordActionGroup}>
                          <RecordActionButton variant="edit" recordName={o.name} onClick={() => startEditOrg(o)} />
                          <RecordActionButton variant="delete" recordName={o.name} onClick={() => promptDeleteOrg(o)} />
                        </span>
                      </div>
                    </div>
                  {editingOrgId === o.id && (
                    <Modal title="Edit school" subtitle={o.name} icon={Building} size="md" onClose={() => setEditingOrgId(null)}>
                    <div className="space-y-3 text-ink">
                      <div>
                        <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                          School Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editOrgName}
                          onChange={(e) => setEditOrgName(e.target.value)}
                          className="w-full p-1.5 border border-line bg-panel font-bold"
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
                          className="w-full p-1.5 border border-line bg-panel font-mono font-bold uppercase"
                        />
                      </div>
                      <label className="flex items-start gap-2 text-[10px] font-bold text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editOrgAskLook}
                          onChange={(e) => setEditOrgAskLook(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-[var(--color-gold)]"
                        />
                        <span>
                          Ask preferred makeup look at the kiosk
                          <span className="block font-normal text-neutral-500">
                            When the package includes makeup / grooming (and it is on in Client Types).
                          </span>
                        </span>
                      </label>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingOrgId(null)}
                          className="btn-tactile px-2.5 py-1 bg-panel border border-line font-bold uppercase cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveOrgEdit}
                          className="btn-tactile px-3 py-1 bg-obsidian text-gold font-black uppercase border border-line cursor-pointer"
                        >
                          ✓ Save
                        </button>
                      </div>
                    </div>
                    </Modal>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SECTION 2: COURSES & ACADEMIC LEVELS (T019) */}
        {/* Courses Management */}
        <div className="bg-panel border-2 border-line shadow-lux p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink pb-3 border-b-2 border-line mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-gold" />
                <span>Degree Programs &amp; Courses</span>
              </span>
              <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
                {assignedCourses.length} Courses
              </span>
            </h3>

            <div className="mb-3 border-l-4 border-gold bg-canvas p-3" aria-live="polite">
              <p><strong>SELECTED SCHOOL:</strong> {selectedSchool?.name ?? 'No school selected'}</p>
              {selectedSchool && <p><strong>SCHOOL CODE:</strong> {selectedSchool.code || '—'}</p>}
            </div>

            {/* Create Course Form */}
            <form onSubmit={handleCreateCourse} className="p-4 bg-canvas border-2 border-line mb-5">
              <fieldset disabled={!selectedSchool || addingCourse} className="min-w-0 space-y-3 disabled:opacity-60">
                <div>
                  <label htmlFor="new-course-level" className="block text-[10px] font-black uppercase mb-1">
                    Target Academic Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="new-course-level"
                    value={selectedLevel?.id ?? levelChoice}
                    onChange={(e) => setPreferredLevelId(e.target.value)}
                    className="w-full p-2 bg-panel border border-line font-bold"
                  >
                    {schoolLevels.length > 0 && (
                      <optgroup label={`Levels at ${selectedSchool?.code || selectedSchool?.name || 'this school'}`}>
                        {levelOptions.filter((lvl) => lvl.organization === selectedSchool?.id).map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Add a level">
                      {/* Level names other schools already use. */}
                      {levelOptions.filter((lvl) => lvl.organization !== selectedSchool?.id).map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>{lvl.name}</option>
                      ))}
                      {newLevelChoices.map((name) => (
                        <option key={name} value={`new:${name}`}>{name}</option>
                      ))}
                      <option value={OTHER_LEVEL}>Other level… (type its name)</option>
                    </optgroup>
                  </select>
                  {levelChoice === OTHER_LEVEL && (
                    <input
                      aria-label="Name of the academic level"
                      value={customLevelName}
                      onChange={(e) => setCustomLevelName(e.target.value)}
                      maxLength={60}
                      placeholder="e.g. Grade School, Masteral, Review Center"
                      className="w-full mt-2 p-2 bg-panel border border-line font-bold"
                    />
                  )}
                  {levelReady && selectedLevel?.organization !== selectedSchool?.id && (
                    <p className="mt-1 text-[10px] text-neutral-600">
                      &ldquo;{selectedLevelName}&rdquo; is added to {selectedSchool?.code || selectedSchool?.name || 'the school'} with its first course.
                    </p>
                  )}
                </div>

                <CourseQuickAdd
                  key={chosenLevelName}
                  catalog={catalogForLevel(selectedLevelName)}
                  courses={courses}
                  availableIds={new Set(searchableCourses.map((course) => course.id))}
                  addedIds={new Set(assignedCourses
                    .filter(({ assignment }) => levelNamesById.get(assignment.level) === chosenLevelName)
                    .map(({ course }) => course.id))}
                  disabled={!selectedSchool || !levelReady || courseCatalogStatus !== 'ready'}
                  onAdd={quickAddCourse}
                />

                <div className="border-t-2 border-line pt-3 space-y-3">
                  <div>
                    <div className="text-[10px] font-black uppercase text-ink">Add a Course Manually</div>
                    <p className="text-[10px] text-neutral-600">
                      Not in the list above? Type the full course name and its acronym (e.g. &ldquo;Bachelor of Science in Hotel and Restaurant Management&rdquo; and &ldquo;BSHRM&rdquo;).
                    </p>
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
                  className="btn-tactile w-full py-2 bg-obsidian text-gold font-black uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed"
                >
                  {addingCourse ? 'Adding Course…' : '+ Add Course'}
                </button>
                </div>
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
                  <div key={lvl.id} className="border border-neutral-300 p-2.5 bg-canvas">
                    <div className="font-black text-[11px] uppercase text-ink pb-1 border-b border-neutral-300 mb-2 flex justify-between">
                      <span>{lvl.name}</span>
                      <span className="text-gold-soft font-mono">{lvlCourses.length} Courses</span>
                    </div>

                    <div className="space-y-1.5">
                      {lvlCourses.map(({ assignment, course: c }) => (
                          <div
                            key={c.id}
                            className="p-2 bg-panel border border-neutral-300 flex flex-wrap justify-between items-center gap-2"
                          >
                              <>
                                <div>
                                  <span className="font-bold text-ink uppercase">{c.name}</span>
                                  {c.code && (
                                    <span className="font-mono font-black text-gold-soft ml-2 text-[10px]">
                                      ({c.code})
                                    </span>
                                  )}
                                </div>
                                <div className={`${recordActionGroup} ml-auto`}>
                                  <RecordActionButton variant="edit" recordName={c.name} onClick={() => startEditCourse(c)} />
                                  <RecordActionButton variant="delete" recordName={`${c.name} from this school`}
                                    onClick={() => promptRemoveCourse(c, assignment.id)} />
                                </div>
                              </>
                            {editingCourseId === c.id && (
                              <Modal title="Edit course" subtitle={c.name} icon={BookOpen} size="md" onClose={() => setEditingCourseId(null)}>
                              <div className="w-full space-y-3">
                                <p className="text-[10px] text-neutral-600">Changes update the shared course for every school that uses it.</p>
                                <div>
                                  <label className="block text-[9px] font-black uppercase text-neutral-600 mb-0.5">
                                    Course Name <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={editCourseName}
                                    onChange={(e) => setEditCourseName(e.target.value)}
                                    className="w-full p-1 border border-line bg-panel font-semibold"
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
                                    className="w-full p-1 border border-line uppercase bg-panel font-bold"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCourseId(null)}
                                    className="btn-tactile px-2.5 py-1 bg-panel border border-line font-bold uppercase cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveCourseEdit}
                                    className="btn-tactile px-3 py-1 bg-obsidian text-gold font-black uppercase border border-line cursor-pointer"
                                  >
                                    ✓ Save
                                  </button>
                                </div>
                              </div>
                              </Modal>
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
