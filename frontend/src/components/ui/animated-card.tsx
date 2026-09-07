import React from 'react';
import { cn } from '@/lib/utils';

/**
 * AnimatedCard — hover-lift card with staggered entrance animation.
 *
 * Inspired by MagicUI's animated card pattern.
 * Follows the blog cards reference (image 09) and staggered selectors (image 11):
 *   - Flat single accent-color backgrounds (not gradients)
 *   - Bold typography doing visual work
 *   - Subtle -translateY hover lift
 *   - Stagger-in entrance via CSS animation-delay
 *
 * NOT glassmorphism. NOT uniform shadow on every card.
 */

import { getStaggerDelay, MOTION } from '@/lib/motion';

interface AnimatedCardProps {
  className?: string;
  children: React.ReactNode;
  /**
   * Stagger index for entrance animation (0-based).
   * Automatically multiplies into standard 60ms animation-delay.
   */
  staggerIndex?: number;
  /** Hover accent border color */
  hoverAccent?: 'forest' | 'ember' | 'grape' | 'none';
  onClick?: () => void;
}

const hoverBorderMap: Record<NonNullable<AnimatedCardProps['hoverAccent']>, string> = {
  forest: 'hover:border-forest',
  ember:  'hover:border-ember',
  grape:  'hover:border-grape',
  none:   '',
};

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  className,
  children,
  staggerIndex = 0,
  hoverAccent = 'forest',
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      style={getStaggerDelay(staggerIndex)}
      className={cn(
        // Base
        'rounded-xl border border-ink/10 bg-white overflow-hidden shadow-card',
        // Standard entrance animation
        MOTION.enter.desktop.className,
        // Standard unified hover-lift physics & touch active press
        MOTION.hoverLift.className,
        MOTION.touch.card.className,
        onClick ? 'cursor-pointer' : '',
        hoverBorderMap[hoverAccent],
        className
      )}
    >
      {children}
    </div>
  );
};

/**
 * AnimatedCardHeader — top section with optional accent color strip.
 */
interface AnimatedCardHeaderProps {
  accent?: 'forest' | 'ember' | 'grape' | 'lime' | 'none';
  className?: string;
  children: React.ReactNode;
}

const accentBgMap: Record<NonNullable<AnimatedCardHeaderProps['accent']>, string> = {
  forest: 'bg-forest text-white',
  ember:  'bg-ember text-white',
  grape:  'bg-grape text-white',
  lime:   'bg-lime text-ink',
  none:   'bg-bg text-ink',
};

export const AnimatedCardHeader: React.FC<AnimatedCardHeaderProps> = ({
  accent = 'none',
  className,
  children,
}) => (
  <div className={cn('px-5 pt-5 pb-4', accentBgMap[accent], className)}>
    {children}
  </div>
);

/**
 * AnimatedCardBody — padded body section.
 */
export const AnimatedCardBody: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div className={cn('px-5 pb-5', className)}>
    {children}
  </div>
);
