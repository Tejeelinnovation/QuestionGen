import React, { useState } from 'react';
import {
  Divide,
  Superscript,
  Subscript,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  HelpCircle,
  FlaskConical,
} from 'lucide-react';
import { MathText } from './MathText';

interface MathToolbarProps {
  onInsert: (snippet: string, cursorOffset?: number) => void;
  value?: string;
  showPreviewToggle?: boolean;
  className?: string;
}

interface QuickAction {
  label: string;
  tooltip: string;
  snippet: string;
  cursorOffset?: number; // Cursor position relative to snippet start
  icon?: React.ReactNode;
}

const MATH_ACTIONS: QuickAction[] = [
  {
    label: '$...$',
    tooltip: 'Inline Math Delimiter ($...$)',
    snippet: '$ $',
    cursorOffset: 1,
  },
  {
    label: 'a/b',
    tooltip: 'Fraction (\\frac{num}{den})',
    snippet: '\\frac{a}{b}',
    cursorOffset: 6,
    icon: <Divide className="w-3 h-3" />,
  },
  {
    label: 'x²',
    tooltip: 'Superscript / Exponent (x^{2})',
    snippet: '^{2}',
    cursorOffset: 2,
    icon: <Superscript className="w-3 h-3" />,
  },
  {
    label: 'xᵢ',
    tooltip: 'Subscript (x_{i})',
    snippet: '_{i}',
    cursorOffset: 2,
    icon: <Subscript className="w-3 h-3" />,
  },
  {
    label: '√x',
    tooltip: 'Square Root (\\sqrt{x})',
    snippet: '\\sqrt{x}',
    cursorOffset: 6,
  },
  {
    label: '±',
    tooltip: 'Plus-Minus (\\pm)',
    snippet: '\\pm ',
  },
  {
    label: '×',
    tooltip: 'Multiplication (\\times)',
    snippet: '\\times ',
  },
  {
    label: '°',
    tooltip: 'Degree Symbol (^{\\circ})',
    snippet: '^{\\circ}',
  },
];

const CHEMISTRY_ACTIONS: QuickAction[] = [
  {
    label: '→',
    tooltip: 'Reaction Arrow (\\rightarrow)',
    snippet: ' \\rightarrow ',
    icon: <ArrowRight className="w-3 h-3" />,
  },
  {
    label: '⇌',
    tooltip: 'Equilibrium (\\rightleftharpoons)',
    snippet: ' \\rightleftharpoons ',
  },
  {
    label: 'Δ',
    tooltip: 'Heat Delta (\\Delta)',
    snippet: '\\Delta ',
  },
  {
    label: '(aq)',
    tooltip: 'Aqueous State (_{(aq)})',
    snippet: '_{(aq)}',
  },
  {
    label: '(s)/(g)',
    tooltip: 'Solid / Gas State',
    snippet: '_{(s)}',
  },
  {
    label: 'mathrm{}',
    tooltip: 'Chemical Formula (\\mathrm{H_2O})',
    snippet: '\\mathrm{H_2O}',
    cursorOffset: 8,
    icon: <FlaskConical className="w-3 h-3" />,
  },
];

const GREEK_SYMBOLS: { symbol: string; latex: string }[] = [
  { symbol: 'α', latex: '\\alpha ' },
  { symbol: 'β', latex: '\\beta ' },
  { symbol: 'γ', latex: '\\gamma ' },
  { symbol: 'θ', latex: '\\theta ' },
  { symbol: 'π', latex: '\\pi ' },
  { symbol: 'λ', latex: '\\lambda ' },
  { symbol: 'σ', latex: '\\sigma ' },
  { symbol: 'ω', latex: '\\omega ' },
  { symbol: 'Ω', latex: '\\Omega ' },
];

export const MathToolbar: React.FC<MathToolbarProps> = ({
  onInsert,
  value = '',
  showPreviewToggle = true,
  className = '',
}) => {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showGreekMenu, setShowGreekMenu] = useState(false);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Toolbar Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 p-1.5 bg-surface-muted/40 border border-border rounded-t-card text-xs">
        {/* Left: Quick Insertion Buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase font-mono font-bold text-ink/40 px-1 select-none">
            Math:
          </span>
          {MATH_ACTIONS.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onInsert(action.snippet, action.cursorOffset)}
              title={action.tooltip}
              className="px-2 py-0.5 rounded-sm bg-surface hover:bg-forest/10 hover:text-forest border border-border hover:border-forest/30 text-ink/80 text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}

          <div className="h-4 w-px bg-border mx-0.5" />

          <span className="text-[10px] uppercase font-mono font-bold text-ink/40 px-1 select-none">
            Chem:
          </span>
          {CHEMISTRY_ACTIONS.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onInsert(action.snippet, action.cursorOffset)}
              title={action.tooltip}
              className="px-2 py-0.5 rounded-sm bg-surface hover:bg-forest/10 hover:text-forest border border-border hover:border-forest/30 text-ink/80 text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}

          <div className="h-4 w-px bg-border mx-0.5" />

          {/* Greek Symbols Dropdown Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowGreekMenu(!showGreekMenu)}
              title="Insert Greek Symbols (α, β, θ, π, etc.)"
              className={`px-2 py-0.5 rounded-sm border text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 shadow-2xs ${
                showGreekMenu
                  ? 'bg-forest text-white border-forest'
                  : 'bg-surface hover:bg-forest/10 hover:text-forest border-border hover:border-forest/30 text-ink/80'
              }`}
            >
              <span>αβγ...</span>
            </button>

            {showGreekMenu && (
              <div
                className="absolute left-0 top-full mt-1 z-30 p-1.5 bg-surface border border-border rounded-card shadow-lg flex flex-wrap gap-1 w-44"
                onMouseLeave={() => setShowGreekMenu(false)}
              >
                {GREEK_SYMBOLS.map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onInsert(g.latex);
                      setShowGreekMenu(false);
                    }}
                    title={`Insert ${g.latex}`}
                    className="w-8 h-7 rounded bg-bg hover:bg-forest/10 hover:text-forest border border-border text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {g.symbol}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Live Preview Toggle */}
        {showPreviewToggle && (
          <button
            type="button"
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className={`px-2 py-0.5 rounded-pill text-[11px] font-heading font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
              isPreviewOpen
                ? 'bg-forest text-white shadow-xs'
                : 'bg-surface text-ink/70 hover:text-ink border border-border hover:border-forest/40'
            }`}
            title="Toggle Live Formula & Math Rendering Preview"
          >
            {isPreviewOpen ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3 text-forest" />}
            <span>{isPreviewOpen ? 'Hide Preview' : 'Live Math Preview'}</span>
          </button>
        )}
      </div>

      {/* Live Preview Card */}
      {isPreviewOpen && (
        <div className="p-3 bg-bg border border-border rounded-b-card shadow-inner space-y-1 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-[10px] font-mono text-ink/50 uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-forest" />
              Rendered LaTeX & Chemistry Preview
            </span>
            <span className="text-[9px] lowercase text-ink/40">kaTeX dynamic engine</span>
          </div>

          <div className="min-h-[38px] p-2.5 rounded bg-surface border border-border/80 text-xs text-ink leading-relaxed font-body">
            {value.trim() ? (
              <MathText text={value} />
            ) : (
              <span className="text-ink/40 italic flex items-center gap-1 text-[11px]">
                <HelpCircle className="w-3 h-3" />
                Type or insert mathematical expressions (e.g., $x^2 + y^2 = r^2$ or \frac&#123;1&#125;&#123;2&#125;) to preview them live.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
