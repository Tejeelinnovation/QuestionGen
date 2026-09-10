import React, { useState, useRef, useEffect, useId } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import type { SelectOption } from '../../constants/educationData';

interface SearchableSelectProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowCustom?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  disabled = false,
  required = false,
  allowCustom = true,
}) => {
  const generatedId = useId();
  const selectId = id || generatedId;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Find currently selected label
  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : value;

  // Filter options based on search query
  const filteredOptions = options.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const matchesLabel = opt.label.toLowerCase().includes(query);
    const matchesValue = opt.value.toLowerCase().includes(query);
    const matchesTags = opt.searchTags?.some((tag) => tag.toLowerCase().includes(query));
    return matchesLabel || matchesValue || matchesTags;
  });

  // Group filtered options by category (if present)
  const categories: { name: string; items: SelectOption[] }[] = [];
  filteredOptions.forEach((opt) => {
    const catName = opt.category || 'Other';
    let group = categories.find((c) => c.name === catName);
    if (!group) {
      group = { name: catName, items: [] };
      categories.push(group);
    }
    group.items.push(opt);
  });

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        onChange(filteredOptions[highlightedIndex].value);
        setIsOpen(false);
      } else if (allowCustom && searchQuery.trim()) {
        onChange(searchQuery.trim());
        setIsOpen(false);
      }
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full space-y-1" ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label
          htmlFor={`${selectId}-trigger`}
          className="block font-heading text-xs font-medium text-ink mb-1"
        >
          {label} {required && <span className="text-ember">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={`${selectId}-trigger`}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full rounded-card border bg-bg px-3.5 py-2.5 text-left text-xs text-ink transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          isOpen ? 'border-forest bg-surface ring-1 ring-forest/20' : 'border-border hover:border-border-strong focus:border-forest'
        }`}
      >
        <span className={`truncate font-body ${!value ? 'text-ink/40' : 'text-ink font-medium'}`}>
          {value ? displayLabel : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-ink/50 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-forest' : ''
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-card border border-border bg-surface shadow-float overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150 flex flex-col"
          style={{ maxHeight: 'min(360px, 60vh)' }}
        >
          {/* Sticky Search Header */}
          <div className="p-2 border-b border-border bg-surface-muted/40 sticky top-0 z-10">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-ink/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Type to search (e.g. CBSE, State name, etc.)..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface rounded-md border border-border text-ink placeholder:text-ink/40 focus:outline-none focus:border-forest"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2 text-ink/40 hover:text-ink p-0.5 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Options List */}
          <div
            ref={listRef}
            role="listbox"
            className="overflow-y-auto flex-1 divide-y divide-border/40 py-1"
          >
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-ink/60">
                  No matching options found for &ldquo;<span className="font-semibold text-ink">{searchQuery}</span>&rdquo;.
                </p>
                {allowCustom && searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSelect(searchQuery.trim())}
                    className="inline-flex items-center gap-1.5 text-xs text-forest hover:underline font-medium cursor-pointer"
                  >
                    <span>Use &ldquo;{searchQuery.trim()}&rdquo; as custom value</span>
                  </button>
                )}
              </div>
            ) : (
              categories.map((group) => (
                <div key={group.name} className="py-1">
                  {categories.length > 1 && (
                    <div className="px-3 py-1 text-[10px] font-heading font-bold uppercase tracking-wider text-ink/50 bg-bg/50">
                      {group.name}
                    </div>
                  )}
                  {group.items.map((opt) => {
                    const isSelected = opt.value === value;
                    const overallIndex = filteredOptions.indexOf(opt);
                    const isHighlighted = overallIndex === highlightedIndex;

                    return (
                      <div
                        key={opt.value}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(opt.value)}
                        onMouseEnter={() => setHighlightedIndex(overallIndex)}
                        className={`px-3 py-2.5 sm:py-2 text-xs cursor-pointer flex items-center justify-between gap-2 min-h-[42px] sm:min-h-[36px] transition-colors ${
                          isSelected
                            ? 'bg-forest/10 text-forest font-semibold'
                            : isHighlighted
                            ? 'bg-surface-muted text-ink'
                            : 'text-ink hover:bg-surface-muted/60'
                        }`}
                      >
                        <div className="flex flex-col">
                          <span className="leading-snug">{opt.label}</span>
                          {opt.value !== opt.label && (
                            <span className="text-[10px] font-mono text-ink/50 leading-tight">
                              ID: {opt.value}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 shrink-0 text-forest stroke-[2.5]" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
