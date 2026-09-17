import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SelectOptionItem {
  value: string;
  label: string;
  badge?: string;
}

export interface CustomSelectProps {
  id?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: (string | SelectOptionItem)[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  searchable?: boolean;
  required?: boolean;
  name?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  disabled = false,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  searchable,
  required = false,
  name,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openUpwards, setOpenUpwards] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options into { value: string, label: string, badge?: string }
  const normalizedOptions: SelectOptionItem[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return {
      value: String(opt.value),
      label: opt.label,
      badge: opt.badge,
    };
  });

  const stringValue = String(value ?? '');
  const selectedOption = normalizedOptions.find((opt) => opt.value === stringValue);
  const displayLabel = selectedOption ? selectedOption.label : (placeholder || 'Select an option...');

  // Auto enable search if more than 7 options unless explicitly specified false
  const shouldEnableSearch = searchable !== undefined ? searchable : normalizedOptions.length > 7;

  // Filter options based on search query
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query);
  });

  // Calculate whether to open upwards based on screen bottom edge
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      // If space below is less than 220px and space above is greater, open upwards
      if (spaceBelow < 220 && rect.top > 220) {
        setOpenUpwards(true);
      } else {
        setOpenUpwards(false);
      }
    }
    setIsOpen((prev) => !prev);
  };

  // Close on outside click (handling both desktop mouse and mobile touch)
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && shouldEnableSearch) {
      setSearchQuery('');
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldEnableSearch]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative w-full text-left ${className}`}
    >
      {name && (
        <input
          type="hidden"
          name={name}
          value={stringValue}
          required={required}
        />
      )}
      {/* Trigger Button */}
      <button
        id={selectId}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full rounded-card border bg-surface px-3 py-2 text-xs text-ink transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left ${
          isOpen
            ? 'border-forest ring-1 ring-forest/30 shadow-xs'
            : 'border-border hover:border-forest/50 focus:border-forest'
        } ${triggerClassName}`}
      >
        <span
          className={`truncate font-body flex-1 ${
            !selectedOption && !value ? 'text-ink/40' : 'text-ink font-medium'
          }`}
        >
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-ink/40 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-forest' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 z-50 rounded-card border border-border bg-surface shadow-float overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 flex flex-col ${
            openUpwards ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${dropdownClassName}`}
          style={{ maxHeight: 'min(280px, 50vh)' }}
        >
          {/* Optional Search Bar */}
          {shouldEnableSearch && (
            <div className="p-2 border-b border-border bg-surface-muted/50 sticky top-0 z-10">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-ink/40 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type to filter..."
                  className="w-full pl-8 pr-7 py-1 text-xs bg-surface rounded-md border border-border text-ink placeholder:text-ink/40 focus:outline-none focus:border-forest"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 text-ink/40 hover:text-ink p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List */}
          <div role="listbox" className="overflow-y-auto flex-1 divide-y divide-border/20 py-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-ink/50">
                No matching options found.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === stringValue;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full px-3 py-2.5 text-xs text-left cursor-pointer flex items-center justify-between gap-2 min-h-[38px] transition-colors ${
                      isSelected
                        ? 'bg-forest/10 text-forest font-semibold'
                        : 'text-ink hover:bg-forest/5 hover:text-forest'
                    }`}
                  >
                    <span className="truncate flex-1">{opt.label}</span>
                    {opt.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-muted border border-border text-ink/60 shrink-0">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-forest shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
