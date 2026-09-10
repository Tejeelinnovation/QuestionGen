import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Plus, X } from 'lucide-react';

export const MAJOR_ACADEMIC_SUBJECTS: string[] = [
  'Mathematics',
  'Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Social Science',
  'History',
  'Geography',
  'Civics',
  'Political Science',
  'Economics',
  'English',
  'English Literature',
  'Hindi',
  'Sanskrit',
  'Computer Science',
  'Information Technology',
  'Environmental Studies (EVS)',
  'Physical Education',
  'Art & Craft',
  'Marathi',
  'Gujarati',
  'Tamil',
  'Telugu',
  'Kannada',
  'Bengali',
  'Punjabi',
  'Urdu',
  'Malayalam',
  'General Science',
  'Music',
];

interface SearchableSubjectSelectProps {
  value: string;
  onChange: (subject: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
  className?: string;
}

export const SearchableSubjectSelect: React.FC<SearchableSubjectSelectProps> = ({
  value,
  onChange,
  placeholder = 'Select or type subject...',
  disabled = false,
  id,
  required = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal search query with incoming value
  useEffect(() => {
    setSearchQuery(value || '');
  }, [value]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // If user typed something custom that is not empty, commit it
        if (searchQuery.trim() && searchQuery !== value) {
          onChange(searchQuery.trim());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchQuery, value, onChange]);

  const filteredSubjects = MAJOR_ACADEMIC_SUBJECTS.filter((s) =>
    s.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const exactMatchExists = MAJOR_ACADEMIC_SUBJECTS.some(
    (s) => s.toLowerCase() === searchQuery.trim().toLowerCase()
  );

  const handleSelect = (subject: string) => {
    onChange(subject);
    setSearchQuery(subject);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchQuery('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSubjects.length > 0 && searchQuery.trim()) {
        handleSelect(filteredSubjects[0]);
      } else if (searchQuery.trim()) {
        handleSelect(searchQuery.trim());
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input bar */}
      <div
        className={`relative flex items-center rounded-card border bg-bg transition-colors ${
          isOpen ? 'border-forest ring-1 ring-forest/20' : 'border-border'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-forest/50 cursor-text'}`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <Search className="w-3.5 h-3.5 text-ink/40 ml-3 shrink-0" />
        
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            // Also propagate manual typing so form validity passes
            onChange(e.target.value);
          }}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="w-full bg-transparent px-2.5 py-2 text-xs text-ink placeholder:text-ink/40 focus:outline-none"
        />

        <div className="flex items-center gap-1 mr-2.5 shrink-0">
          {searchQuery && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-sm text-ink/40 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              title="Clear subject"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-ink/40 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-forest' : ''
            }`}
          />
        </div>
      </div>

      {/* Searchable Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-card border border-border bg-surface shadow-float overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-1.5 border-b border-border bg-surface-muted text-[10px] font-mono text-ink/60 uppercase tracking-wider flex items-center justify-between">
            <span>Major Academic Subjects</span>
            <span>{filteredSubjects.length} found</span>
          </div>

          <div className="max-h-52 overflow-y-auto p-1 space-y-0.5">
            {/* Custom option prompt if typed text is not an exact match */}
            {searchQuery.trim() && !exactMatchExists && (
              <button
                type="button"
                onClick={() => handleSelect(searchQuery.trim())}
                className="w-full text-left px-2.5 py-1.5 rounded-sm text-xs text-forest bg-forest/5 hover:bg-forest/10 font-heading font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-dashed border-forest/30"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Use custom subject: <strong className="font-bold">"{searchQuery.trim()}"</strong></span>
              </button>
            )}

            {filteredSubjects.map((subject) => {
              const isSelected = value?.toLowerCase() === subject.toLowerCase();
              return (
                <button
                  key={subject}
                  type="button"
                  onClick={() => handleSelect(subject)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-sm text-xs flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-forest text-white font-semibold'
                      : 'text-ink hover:bg-surface-muted'
                  }`}
                >
                  <span>{subject}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                </button>
              );
            })}

            {filteredSubjects.length === 0 && !searchQuery.trim() && (
              <div className="p-3 text-center text-xs text-ink/50 italic">
                No subjects available.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
