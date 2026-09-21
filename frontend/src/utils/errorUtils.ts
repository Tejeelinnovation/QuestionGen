/**
 * Universal error message extraction utility for Question Generation System.
 * Ensures that full, detailed API error messages (including field validation
 * errors like available_until, student_ids, out-of-scope notices, etc.) are
 * cleanly displayed instead of short, generic fallbacks across Desktop, Tablet, and Mobile.
 */
export function extractApiErrorMessage(err: any, fallback: string = 'An unexpected error occurred.'): string {
  if (!err) return fallback;

  // Direct string error
  if (typeof err === 'string') return err;

  const data = err.response?.data;
  if (!data) {
    if (err.message && typeof err.message === 'string') {
      return err.message;
    }
    return fallback;
  }

  // If response data is already a string
  if (typeof data === 'string') {
    return data;
  }

  // Detail / error message field
  if (typeof data.detail === 'string' && data.detail.trim().length > 0) {
    return data.detail;
  }

  if (typeof data.error === 'string' && data.error.trim().length > 0) {
    return data.error;
  }

  // Non-field errors
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0]);
  }

  // Field-level error dictionary (e.g., { available_until: ["..."], student_ids: ["..."] })
  if (typeof data === 'object' && !Array.isArray(data)) {
    const errorMessages: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fieldName = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

      if (Array.isArray(value) && value.length > 0) {
        errorMessages.push(`${fieldName}: ${value[0]}`);
      } else if (typeof value === 'string' && value.trim().length > 0) {
        errorMessages.push(`${fieldName}: ${value}`);
      } else if (typeof value === 'object' && value !== null) {
        // Nested error
        errorMessages.push(`${fieldName}: ${JSON.stringify(value)}`);
      }
    }

    if (errorMessages.length > 0) {
      return errorMessages.join(' • ');
    }
  }

  // Final fallback
  return fallback;
}
