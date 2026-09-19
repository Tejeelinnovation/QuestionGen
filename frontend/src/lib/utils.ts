import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn - merges Tailwind CSS class names intelligently.
 * Resolves conflicts (e.g. bg-red-500 vs bg-blue-500) using tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
