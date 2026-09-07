import React from 'react';
import { cn } from '@/lib/utils';
import { MOTION } from '@/lib/motion';

/**
 * BentoGrid — asymmetric grid layout component.
 *
 * Inspired by Aceternity UI's Bento Grid pattern.
 * Adapted for our design system: forest green, ember orange, warm off-white palette.
 *
 * Usage:
 *   <BentoGrid>
 *     <BentoCard title="Stats" description="..." className="col-span-2" />
 *     <BentoCard title="Quick Actions" description="..." />
 *   </BentoGrid>
 */

interface BentoGridProps {
  className?: string;
  children: React.ReactNode;
}

interface BentoCardProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  /** When true the card background becomes the primary forest green accent */
  accent?: 'forest' | 'ember' | 'grape' | 'lime' | 'default';
  children?: React.ReactNode;
  onClick?: () => void;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ className, children }) => {
  return (
    <div
      className={cn(
        'grid auto-rows-[minmax(140px,auto)] gap-4',
        'grid-cols-1 md:grid-cols-3 lg:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  );
};

const accentClasses: Record<NonNullable<BentoCardProps['accent']>, string> = {
  forest: 'bg-forest text-white border-forest',
  ember:  'bg-ember text-white border-ember',
  grape:  'bg-grape text-white border-grape',
  lime:   'bg-lime text-ink border-lime',
  default: 'bg-white text-ink border-ink/10',
};

export const BentoCard: React.FC<BentoCardProps> = ({
  title,
  description,
  icon,
  className,
  accent = 'default',
  children,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        // Base card styles matching our design token radius (12px = rounded-xl)
        'relative rounded-xl border p-5 overflow-hidden shadow-card',
        // Hover lift and touch active press
        onClick ? `cursor-pointer ${MOTION.hoverLift.className} ${MOTION.touch.card.className}` : '',
        accentClasses[accent],
        className
      )}
    >
      {/* Icon slot */}
      {icon && (
        <div className="mb-3 [&_svg]:size-5 [&_svg]:stroke-current opacity-80">
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className="font-heading font-bold text-lg leading-tight mb-1">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm opacity-75 leading-relaxed">
          {description}
        </p>
      )}

      {/* Custom content */}
      {children}
    </div>
  );
};
