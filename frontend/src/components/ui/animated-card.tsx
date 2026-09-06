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

interface AnimatedCardProps {
  className?: string;
  children: React.ReactNode;
  /**
   * Stagger index for entrance animation (0-based).
   * Automatically multiplies into animation-delay.
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
  const delayMs = staggerIndex * 60; // 60ms stagger between cards

  return (
    <div
      onClick={onClick}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        // Base
        'rounded-xl border border-ink/10 bg-white overflow-hidden',
        // Entrance animation — slides up from 12px below, fades in
        'animate-card-enter',
        // Hover lift + border accent swap
        'transition-all duration-250 ease-out',
        'hover:-translate-y-1',
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
