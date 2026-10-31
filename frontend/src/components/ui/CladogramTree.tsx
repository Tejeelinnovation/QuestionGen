import React, { useMemo } from 'react';

interface CladogramTreeProps {
  content: string;
  className?: string;
  title?: string;
}

interface TreeNode {
  level: number;
  label: string;
  rank?: string;
  subtext?: string;
}

/**
 * Biological Taxonomic Hierarchy & Cladogram Tree Component
 * Renders hierarchical cladograms, taxonomic ranks, and phylogenetic lineage
 * across mobile, tablet, desktop, and print views.
 */
export const CladogramTree: React.FC<CladogramTreeProps> = ({
  content,
  className = '',
  title = 'Taxonomic Hierarchy / Cladogram',
}) => {
  const nodes = useMemo<TreeNode[]>(() => {
    if (!content) return [];

    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const ranks = ['KINGDOM', 'PHYLUM', 'CLASS', 'ORDER', 'FAMILY', 'GENUS', 'SPECIES', 'DOMAIN'];

    return lines.map((line) => {
      // Determine indentation level
      const leadingSpaces = line.search(/\S|$/);
      let clean = line.trim();

      // Clean ASCII branch glyphs (├──, └──, │, ->)
      clean = clean.replace(/^[│├└─\s\-–—>]+/, '').trim();

      // Check for Rank: Value pattern (e.g. "Phylum: Chordata")
      let rank: string | undefined;
      let label = clean;
      let subtext: string | undefined;

      const colonIdx = clean.indexOf(':');
      if (colonIdx !== -1) {
        const potentialRank = clean.slice(0, colonIdx).trim().toUpperCase();
        if (ranks.some((r) => potentialRank.includes(r))) {
          rank = clean.slice(0, colonIdx).trim();
          label = clean.slice(colonIdx + 1).trim();
        }
      }

      // Check for parenthetical common or scientific name: e.g. "Mammalia (Mammals)"
      const parenMatch = label.match(/^([^\(]+)\s*\(([^\)]+)\)$/);
      if (parenMatch) {
        label = parenMatch[1].trim();
        subtext = parenMatch[2].trim();
      }

      const calculatedLevel = Math.min(6, Math.floor(leadingSpaces / 2));

      return {
        level: calculatedLevel,
        label,
        rank,
        subtext,
      };
    });
  }, [content]);

  if (nodes.length === 0) return null;

  return (
    <div
      className={`cladogram-container my-3 p-3 bg-white print:bg-transparent border border-gray-200 print:border-black rounded-card shadow-xs max-w-full overflow-x-auto ${className}`}
    >
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-100 print:border-gray-400">
        <span className="font-heading font-bold text-xs uppercase tracking-wider text-forest print:text-black">
          {title}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 print:bg-transparent print:border print:border-black text-gray-700 print:text-black">
          BIOLOGICAL CLADOGRAM
        </span>
      </div>

      <div className="space-y-1.5 py-1">
        {nodes.map((node, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2"
            style={{ paddingLeft: `${node.level * 20}px` }}
          >
            {node.level > 0 && (
              <span className="text-gray-400 print:text-black font-mono text-xs select-none">
                └─
              </span>
            )}
            {node.rank && (
              <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 print:border-black print:bg-transparent print:text-black shrink-0">
                {node.rank}
              </span>
            )}
            <span className="font-body text-xs font-semibold text-gray-900 print:text-black">
              {node.label}
            </span>
            {node.subtext && (
              <span className="font-serif italic text-xs text-gray-600 print:text-black">
                ({node.subtext})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

