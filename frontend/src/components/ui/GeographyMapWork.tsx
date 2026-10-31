import React from 'react';

interface GeographyMapWorkProps {
  features?: string[];
  title?: string;
  className?: string;
  instructions?: string;
}

/**
 * Dedicated Geographic & Spatial Map Work Component
 * Renders high-resolution vector outline map with coordinate grid lines (lat/long extents),
 * geographic bounding box, standard meridian, and student pointing stations (A, B, C, D, E).
 */
export const GeographyMapWork: React.FC<GeographyMapWorkProps> = ({
  features = [
    'A major seaport on the western coast',
    'An iron and steel plant in eastern India',
    'A major wheat-producing region',
    'A national park in north-eastern India',
    'A nuclear power plant on the southern coast',
  ],
  title = 'SECTION E: MAP WORK (5 MARKS)',
  instructions = 'On the outline map below, identify the geographic features marked by letters (A) to (E). Write their correct names against the corresponding blanks.',
  className = '',
}) => {
  return (
    <div
      className={`map-work-card my-4 p-4 bg-white print:bg-transparent border-2 border-black rounded-card shadow-xs max-w-full overflow-x-auto ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 mb-3 border-b-2 border-black gap-2">
        <div>
          <h4 className="font-heading font-bold text-sm sm:text-base text-black uppercase tracking-wide">
            {title}
          </h4>
          <p className="text-xs font-serif italic text-gray-800 print:text-black mt-0.5">
            {instructions}
          </p>
        </div>
        <div className="text-xs font-mono font-bold px-2.5 py-1 bg-gray-100 print:bg-transparent border border-black rounded shrink-0">
          [Total: 5 Marks]
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Vector Outline Map with Coordinate Grid */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-2 bg-gray-50/50 print:bg-transparent border border-gray-300 print:border-black rounded">
          <div className="text-[11px] font-mono font-semibold text-center text-gray-700 print:text-black pb-1">
            INDIA OUTLINE MAP WITH LATITUDE / LONGITUDE EXTENTS
          </div>
          <svg
            viewBox="0 0 400 480"
            className="w-full max-w-sm sm:max-w-md h-auto max-h-[380px] text-black"
          >
            {/* Coordinate Grid Box */}
            <rect
              x="20"
              y="20"
              width="360"
              height="440"
              fill="none"
              stroke="#000"
              strokeWidth="1.5"
            />

            {/* Latitude Grid Ticks & Labels (8°4'N to 37°6'N) */}
            <line x1="20" y1="40" x2="380" y2="40" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="24" y="36" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">36°N</text>

            <line x1="20" y1="120" x2="380" y2="120" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="24" y="116" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">28°N</text>

            {/* Tropic of Cancer (23.5°N) */}
            <line x1="20" y1="165" x2="380" y2="165" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
            <text x="24" y="161" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" className="print:fill-black">23°30'N (Tropic of Cancer)</text>

            <line x1="20" y1="240" x2="380" y2="240" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="24" y="236" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">20°N</text>

            <line x1="20" y1="340" x2="380" y2="340" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="24" y="336" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">12°N</text>

            <line x1="20" y1="410" x2="380" y2="410" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="24" y="406" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">8°4'N</text>

            {/* Longitude Grid Ticks & Labels (68°7'E to 97°25'E) */}
            <line x1="60" y1="20" x2="60" y2="460" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="56" y="455" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">68°E</text>

            {/* Standard Meridian of India (82°30'E) */}
            <line x1="220" y1="20" x2="220" y2="460" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 2" />
            <text x="200" y="455" fontSize="9" fontFamily="monospace" fontWeight="bold" fill="#0f172a" className="print:fill-black">82°30'E (Std Meridian)</text>

            <line x1="330" y1="20" x2="330" y2="460" stroke="#cbd5e1" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="325" y="455" fontSize="9" fontFamily="monospace" fill="#64748b" className="print:fill-black">96°E</text>

            {/* Stylized Vector Silhouette of Indian Subcontinent Coastline & Borders */}
            <path
              d="M 180,45 
                 C 210,50 230,70 215,95
                 C 205,110 220,120 250,130
                 C 275,135 300,125 320,140
                 C 345,155 355,175 340,195
                 C 325,210 310,205 295,215
                 C 275,230 260,260 250,290
                 C 240,320 225,360 200,410
                 C 185,380 165,340 150,300
                 C 140,265 130,240 115,225
                 C 90,210 80,185 105,170
                 C 125,160 140,140 130,115
                 C 120,90 145,55 180,45 Z"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth="2"
              className="print:fill-transparent print:stroke-black"
            />

            {/* Pointing Station (A) - Western Coast Seaport (Mumbai / Kandla) */}
            <g transform="translate(112, 225)">
              <circle cx="0" cy="0" r="10" fill="#dc2626" className="print:fill-black" />
              <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">A</text>
              <line x1="12" y1="-5" x2="35" y2="-20" stroke="#000" strokeWidth="1.2" />
              <rect x="35" y="-30" width="22" height="18" fill="#fff" stroke="#000" strokeWidth="1" />
              <text x="46" y="-17" textAnchor="middle" fontSize="10" fontWeight="bold">A</text>
            </g>

            {/* Pointing Station (B) - Iron & Steel Plant (Jamshedpur / Bokaro) */}
            <g transform="translate(255, 185)">
              <circle cx="0" cy="0" r="10" fill="#2563eb" className="print:fill-black" />
              <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">B</text>
              <line x1="12" y1="5" x2="35" y2="20" stroke="#000" strokeWidth="1.2" />
              <rect x="35" y="12" width="22" height="18" fill="#fff" stroke="#000" strokeWidth="1" />
              <text x="46" y="25" textAnchor="middle" fontSize="10" fontWeight="bold">B</text>
            </g>

            {/* Pointing Station (C) - Northern Wheat / Agricultural Region (Punjab / Haryana) */}
            <g transform="translate(150, 115)">
              <circle cx="0" cy="0" r="10" fill="#16a34a" className="print:fill-black" />
              <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">C</text>
              <line x1="-12" y1="-5" x2="-35" y2="-18" stroke="#000" strokeWidth="1.2" />
              <rect x="-57" y="-28" width="22" height="18" fill="#fff" stroke="#000" strokeWidth="1" />
              <text x="-46" y="-15" textAnchor="middle" fontSize="10" fontWeight="bold">C</text>
            </g>

            {/* Pointing Station (D) - North-East National Park (Kaziranga / Manas) */}
            <g transform="translate(325, 160)">
              <circle cx="0" cy="0" r="10" fill="#7c3aed" className="print:fill-black" />
              <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">D</text>
              <line x1="12" y1="-5" x2="32" y2="-18" stroke="#000" strokeWidth="1.2" />
              <rect x="32" y="-28" width="22" height="18" fill="#fff" stroke="#000" strokeWidth="1" />
              <text x="43" y="-15" textAnchor="middle" fontSize="10" fontWeight="bold">D</text>
            </g>

            {/* Pointing Station (E) - Southern Nuclear Power Plant (Kalpakkam / Kudankulam) */}
            <g transform="translate(205, 375)">
              <circle cx="0" cy="0" r="10" fill="#d97706" className="print:fill-black" />
              <text x="0" y="3.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff">E</text>
              <line x1="12" y1="5" x2="35" y2="20" stroke="#000" strokeWidth="1.2" />
              <rect x="35" y="12" width="22" height="18" fill="#fff" stroke="#000" strokeWidth="1" />
              <text x="46" y="25" textAnchor="middle" fontSize="10" fontWeight="bold">E</text>
            </g>
          </svg>
        </div>

        {/* Question Prompt & Answer Writing Lines */}
        <div className="lg:col-span-5 space-y-3 font-body">
          <div className="text-xs font-mono font-bold text-gray-900 print:text-black uppercase border-b border-gray-200 pb-1">
            Map Identification Tasks [1 Mark Each]:
          </div>
          <div className="space-y-3">
            {features.map((feat, fIdx) => {
              const letter = String.fromCharCode(65 + fIdx);
              return (
                <div key={letter} className="text-xs space-y-1">
                  <div className="font-semibold text-gray-900 print:text-black flex items-baseline gap-1.5">
                    <span className="font-mono font-bold text-forest print:text-black">({letter})</span>
                    <span>{feat}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[11px] font-mono text-gray-600 print:text-black shrink-0">
                      Answer ({letter}):
                    </span>
                    <span className="flex-1 border-b border-black inline-block min-w-[140px] h-4" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 text-[11px] font-mono text-gray-600 print:text-black italic">
            * Note for Candidates: Tie this completed outline map securely inside your main answer booklet.
          </div>
        </div>
      </div>
    </div>
  );
};

