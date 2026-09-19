import React from 'react';

/**
 * Motion Tokens & Physics System
 * Question Generation System - UI Redesign
 *
 * Single source of truth for motion timing, easing, stagger delays,
 * hover-lifts, and touch interactions across all screens and breakpoints.
 */

export const MOTION = {
  // ── 1. Stagger Delay ──
  // Single fixed standard stagger delay between list/grid items
  staggerDelayMs: 60,
  mobileStaggerDelayMs: 40,

  // ── 2. Entrance Animation ──
  // Desktop: 300ms smooth cubic-bezier slide up 12px
  // Mobile:  200ms lightweight slide up 6px (faster for touch snappiness)
  enter: {
    desktop: {
      durationMs: 300,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      translateY: '12px',
      className: 'animate-card-enter',
    },
    mobile: {
      durationMs: 200,
      easing: 'ease-out',
      translateY: '6px',
      className: 'animate-card-enter',
    },
  },

  // ── 3. Hover Lift Physics ──
  // Identical lift distance (-4px), shadow change, and duration on every card
  hoverLift: {
    translateY: '-4px', // Tailwind: hover:-translate-y-1
    shadow: 'hover:shadow-md',
    durationMs: 200,
    easing: 'ease-out',
    // Combined utility classes for standard card hover-lift
    className: 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-md',
  },

  // ── 4. Touch Active States (Tablet & Mobile) ──
  // Replaces hover where touch devices have no hover equivalent
  touch: {
    card: {
      scale: 0.99,
      durationMs: 100,
      className: 'transition-transform duration-100 ease-out active:scale-[0.99]',
    },
    button: {
      scale: 0.95,
      durationMs: 100,
      className: 'transition-transform duration-100 ease-out active:scale-95',
    },
  },

  // ── 5. Non-Animated Scope (Explicitly NOT Animated) ──
  // - Buttons: Instant/snappy response, no sluggish morphing
  // - Form Inputs: Instant focus ring outline, no animated sliding/resizing
  // - Test Attempt Screen: Strictly calm & focused. Deliberately NO card
  //   entrance staggering and NO hover-lifts during exams to prevent distraction.
  calmMode: {
    animateCards: false,
    hoverLift: false,
  },
} as const;

/**
 * Returns inline style for staggered entrance delays.
 * @param index 0-based item index
 * @param isMobile Optional flag for faster mobile stagger
 */
export function getStaggerDelay(index: number, isMobile = false): React.CSSProperties {
  const step = isMobile ? MOTION.mobileStaggerDelayMs : MOTION.staggerDelayMs;
  return { animationDelay: `${index * step}ms` };
}

/**
 * Common composite class combinations for easy import into JSX
 */
export const CARD_MOTION = {
  // Complete interactive card class combo (Desktop: hover-lift; Touch: active press)
  interactive: `${MOTION.hoverLift.className} ${MOTION.touch.card.className}`,
  // Touch-only card for mobile/tablet feeds
  touchCard: MOTION.touch.card.className,
  // Entrance animation class
  enter: MOTION.enter.desktop.className,
};
