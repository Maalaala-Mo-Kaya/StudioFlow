import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Course } from '../../../types';

interface CourseAutocompleteProps {
  field: 'name' | 'code';
  value: string;
  courses: Course[];
  status: 'loading' | 'ready' | 'error';
  onChange: (value: string) => void;
  onSelect: (course: Course) => void;
}

const searchKey = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

const rank = (value: string, query: string) => {
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  return value.includes(query) ? 2 : Infinity;
};

export function CourseAutocomplete({ field, value, courses, status, onChange, onSelect }: CourseAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const inputId = `new-course-${field}`;
  const listId = `${inputId}-suggestions`;
  const query = searchKey(value);
  const showPopup = open && !!query;
  const results = query
    ? courses
      .map((course) => {
        const nameRank = rank(searchKey(course.name), query);
        const codeRank = rank(searchKey(course.code ?? ''), query);
        return { course, rank: Math.min(nameRank, codeRank), fieldRank: field === 'code' ? codeRank : nameRank };
      })
      .filter((match) => Number.isFinite(match.rank))
      .sort((a, b) => a.rank - b.rank || a.fieldRank - b.fieldRank || a.course.name.localeCompare(b.course.name))
      .slice(0, 20)
      .map(({ course }) => course)
    : [];
  const activeCourse = showPopup ? results[activeIndex] : undefined;

  useEffect(() => {
    if (activeCourse) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeCourse, activeIndex]);

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const select = (course: Course) => {
    close();
    onSelect(course);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && showPopup) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && showPopup) {
      event.preventDefault();
      if (activeCourse) select(activeCourse);
    } else if (query && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setOpen(true);
      if (!results.length) {
        setActiveIndex(-1);
      } else if (event.key === 'ArrowDown') {
        setActiveIndex(activeIndex < results.length - 1 ? activeIndex + 1 : 0);
      } else {
        setActiveIndex(activeIndex > 0 ? activeIndex - 1 : results.length - 1);
      }
    }
  };

  const statusText = status === 'loading' ? 'Loading course catalog…'
    : status === 'error' ? 'Course catalog unavailable. Refresh the page to search.'
    : 'No matching courses for this level.';

  return (
    <div className="min-w-0 sm:relative">
      <label htmlFor={inputId} className="block text-[10px] font-black uppercase mb-1">
        {field === 'code' ? 'Course Code' : 'Course Name'}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showPopup}
        aria-controls={showPopup ? listId : undefined}
        aria-activedescendant={activeCourse ? `${listId}-${activeCourse.id}` : undefined}
        placeholder={field === 'code' ? 'BSN' : 'Bachelor of Science in Nursing'}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={handleKeyDown}
        className={`w-full p-2 bg-white border border-[#0A0A0A] ${field === 'code' ? 'uppercase font-bold' : 'font-semibold'}`}
      />
      {showPopup && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 border-2 border-[#0A0A0A] bg-white shadow-[3px_3px_0px_#C9A227]">
          <ul id={listId} role="listbox" aria-label="Matching courses" ref={listRef} className="max-h-48 overflow-y-auto overscroll-contain">
            {results.map((course, index) => (
              <li
                key={course.id}
                id={`${listId}-${course.id}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(course)}
                className={`cursor-pointer border-b border-neutral-200 px-2.5 py-2 wrap-break-word last:border-b-0 ${
                  index === activeIndex ? 'bg-[#0A0A0A] text-[#C9A227]' : 'hover:bg-[#F8F7F4]'
                }`}
              >
                {field === 'code' && course.code
                  ? <><strong>{course.code}</strong> — {course.name}</>
                  : <>{course.name}{course.code && <> (<strong>{course.code}</strong>)</>}</>}
              </li>
            ))}
          </ul>
          {!results.length && <p role="status" className="px-2.5 py-2 text-neutral-600">{statusText}</p>}
        </div>
      )}
    </div>
  );
}
