import React from 'react';

interface PhoneInputProps {
  id?: string;
  label?: string;
  value: string; // Stored as "+91XXXXXXXXXX" or "XXXXXXXXXX"
  onChange: (fullValue: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  id = 'phone-input',
  label = 'Mobile Number',
  value,
  onChange,
  required = true,
  disabled = false,
  placeholder = '98765 43210',
  error,
}) => {
  // Extract only the 10 digits part for display/editing
  const extractDigits = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    // If it starts with 91 and has 12 digits, strip leading 91
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return cleaned.slice(2);
    }
    // If user typed up to 10 digits
    return cleaned.slice(0, 10);
  };

  const digits = extractDigits(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDigits = e.target.value.replace(/\D/g, '').slice(0, 10);
    // Send full +91XXXXXXXXXX when digits exist, or empty string if empty
    if (newDigits.length > 0) {
      onChange(`+91${newDigits}`);
    } else {
      onChange('');
    }
  };

  const isValid10 = digits.length === 10;

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor={id}
            className="block font-heading text-xs font-semibold uppercase tracking-wider text-ink"
          >
            {label} {required && <span className="text-ember">*</span>}
          </label>
          <span
            className={`font-mono text-[10px] ${
              isValid10 ? 'text-forest font-semibold' : 'text-ink/40'
            }`}
          >
            {digits.length}/10 digits
          </span>
        </div>
      )}

      <div className="relative flex items-center rounded-card border border-border bg-bg overflow-hidden focus-within:border-forest focus-within:bg-surface focus-within:ring-1 focus-within:ring-forest/20 transition-all">
        {/* Country Code Prefix */}
        <div className="flex items-center gap-1 px-3 py-2 bg-surface-muted/60 border-r border-border select-none text-ink/70 font-mono text-xs font-medium">
          <span>🇮🇳</span>
          <span className="font-semibold text-ink">+91</span>
        </div>

        {/* 10 Digit Phone Number Input */}
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          required={required}
          disabled={disabled}
          value={digits}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-xs text-ink bg-transparent placeholder:text-ink/40 focus:outline-none font-mono tracking-wider"
        />

        {isValid10 && (
          <div className="pr-3 text-forest">
            <span className="text-xs font-bold">✓</span>
          </div>
        )}
      </div>

      {error && <p className="text-[11px] text-ember font-medium mt-1">{error}</p>}
    </div>
  );
};
