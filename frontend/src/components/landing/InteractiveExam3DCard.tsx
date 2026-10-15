import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Lock, CheckCircle2, Sparkles, Timer } from 'lucide-react';

interface InteractiveExam3DCardProps {
  className?: string;
}

export const InteractiveExam3DCard: React.FC<InteractiveExam3DCardProps> = ({ className = '' }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState<number>(3);
  const [rotateY, setRotateY] = useState<number>(-6);
  const [glarePos, setGlarePos] = useState<{ x: number; y: number; opacity: number }>({
    x: 50,
    y: 50,
    opacity: 0.1,
  });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [hasEntered, setHasEntered] = useState<boolean>(false);

  // Live exam countdown seconds
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5385);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasEntered(true);
    }, 60);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 5400));
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Enhanced interactive 3D rotation angle (+/- 18 degrees for realistic 3D feel)
    const rY = ((x - centerX) / centerX) * 18;
    const rX = -((y - centerY) / centerY) * 18;

    setRotateX(rX);
    setRotateY(rY);

    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.35,
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setRotateX(3);
    setRotateY(-6);
    setGlarePos((prev) => ({ ...prev, opacity: 0.08 }));
  }, []);

  return (
    <div
      className={`relative select-none p-2 sm:p-4 flex items-center justify-center ${className}`}
      style={{ perspective: '1500px' }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── SOFT AMBIENT GLOW BACKDROP ── */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-1000 ${
          hasEntered ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        }`}
      >
        <div className="w-[450px] h-[450px] rounded-full bg-forest/8 blur-3xl pointer-events-none" />
      </div>

      {/* ── 3D FLOATING WORKSPACE CONTAINER ── */}
      <div
        ref={cardRef}
        className={`w-full max-w-[340px] xs:max-w-[380px] sm:max-w-[420px] relative transition-transform duration-300 ease-out z-20 ${
          !isHovered ? 'animate-ambient-float' : ''
        }`}
        style={{
          transformStyle: 'preserve-3d',
          transform: isHovered
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03, 1.03, 1.03)`
            : undefined,
        }}
      >
        {/* Layered Under-sheets with Natural Stack Offset (Paper Stack Feel) */}
        <div
          className="absolute inset-2 rounded-2xl bg-surface-muted/90 border border-border shadow-md pointer-events-none transition-transform duration-500"
          style={{
            transform: 'rotate(2.5deg) translateZ(-15px)',
          }}
        />
        <div
          className="absolute inset-2 rounded-2xl bg-surface/90 border border-border/80 shadow-md pointer-events-none transition-transform duration-500"
          style={{
            transform: 'rotate(-2deg) translateZ(-8px)',
          }}
        />

        {/* ── MAIN EXAM SHEET (Clean, Modern Glass Paper - No Green Border, No Yellow Badge) ── */}
        <div
          className="relative rounded-2xl bg-surface/98 backdrop-blur-md border border-border/90 p-4 sm:p-7 shadow-2xl transition-all duration-300"
          style={{
            transform: 'translateZ(25px)',
            transformStyle: 'preserve-3d',
            boxShadow: '0 25px 50px -12px rgba(17, 34, 25, 0.18), 0 0 0 1px rgba(226, 221, 215, 0.8)',
          }}
        >
          {/* Dynamic Light Sheen Overlay */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none z-30 transition-opacity duration-200"
            style={{
              background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 65%)`,
              opacity: glarePos.opacity,
            }}
          />

          {/* School Header */}
          <div className="border-b border-border/70 pb-3.5 mb-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-heading text-xs font-bold uppercase tracking-wider text-forest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-ember" />
                Greenwood International High
              </span>
              <span className="font-mono text-[10px] text-ink/60 bg-bg px-2 py-0.5 rounded border border-border">
                Term 2 Exam
              </span>
            </div>

            <h3 className="font-heading font-bold text-xl text-ink tracking-tight">
              Mathematics Assessment Paper
            </h3>

            <div className="flex flex-wrap items-center gap-2 mt-2 font-mono text-[10px] text-ink/75">
              <span className="bg-bg px-2 py-0.5 rounded border border-border font-medium">Class 10 • Sec A</span>
              <span className="bg-bg px-2 py-0.5 rounded border border-border font-bold text-forest">
                Total Marks: 40
              </span>
              <span className="bg-bg px-2 py-0.5 rounded border border-border">Code: MATH-102</span>
            </div>
          </div>

          {/* Blueprint Difficulty Balance Bar */}
          <div className="mb-4 bg-bg border border-border/80 rounded-card p-3 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-heading font-semibold mb-1.5">
              <span className="text-ink/70">Blueprint Balance</span>
              <span className="text-forest font-bold">100% Curriculum Calibrated</span>
            </div>
            <div className="w-full h-2 rounded-pill bg-border/40 overflow-hidden flex">
              <div className="bg-forest h-full" style={{ width: '35%' }} title="Easy: 35%" />
              <div className="bg-ember h-full" style={{ width: '45%' }} title="Medium: 45%" />
              <div className="bg-lime h-full" style={{ width: '20%' }} title="Challenging: 20%" />
            </div>
            <div className="flex justify-between text-[9px] text-ink/60 mt-1 font-mono">
              <span>Easy: 14m</span>
              <span>Medium: 18m</span>
              <span>Hard: 8m</span>
            </div>
          </div>

          {/* Curriculum Questions Preview */}
          <div className="space-y-3 font-body text-xs text-ink/80">
            <div className="p-3 rounded-card bg-surface border border-border/70 hover:border-forest/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">Q1. Prove that √5 is an irrational number.</span>
                <span className="font-mono text-[10px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded shrink-0">
                  3 Marks
                </span>
              </div>
              <div className="mt-1 text-[10px] text-ink/50 font-mono">Topic: Real Numbers • Fundamental Theorem</div>
            </div>

            <div className="p-3 rounded-card bg-surface border border-border/70 hover:border-forest/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">
                  Q2. If HCF(306, 657) = 9, find LCM(306, 657).
                </span>
                <span className="font-mono text-[10px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded shrink-0">
                  1 Mark
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
                <span className="px-2 py-0.5 rounded bg-bg border border-forest/30 font-semibold text-forest">
                  A) 22,338 ✓
                </span>
                <span className="px-2 py-0.5 rounded bg-bg border border-border/60 text-ink/60">
                  B) 18,442
                </span>
              </div>
            </div>
          </div>

          {/* Footnote */}
          <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-ink/50">
            <span>Section A of 3 • 12 Questions</span>
            <span>All Questions Compulsory</span>
          </div>
        </div>

        {/* ── MULTI-DIRECTIONAL FLOATING OBJECT 1: Live Exam Timer (Slides in from Top-Right) ── */}
        <div
          className={`absolute -top-4 right-0 sm:-right-4 bg-ink text-white px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-pill shadow-2xl border border-white/20 flex items-center gap-2 sm:gap-2.5 z-40 pointer-events-none transition-all duration-700 ${
            hasEntered ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'
          }`}
          style={{ transform: 'translateZ(65px)' }}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-forest flex items-center justify-center shrink-0">
            <Timer className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-lime animate-pulse" />
          </div>
          <div>
            <div className="font-mono font-bold text-xs sm:text-sm tracking-widest text-lime">
              {formatTimer(secondsRemaining)}
            </div>
            <div className="text-[8px] sm:text-[9px] font-mono uppercase tracking-wider text-white/60">
              Live Exam Sitting
            </div>
          </div>
        </div>

        {/* ── MULTI-DIRECTIONAL FLOATING OBJECT 2: Set A Locked Tag (Slides in from Top-Left) ── */}
        <div
          className={`absolute -top-3 left-0 sm:-left-4 bg-forest text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-pill text-[10px] sm:text-[11px] font-heading font-semibold shadow-xl border border-lime/30 flex items-center gap-1.5 z-40 pointer-events-none transition-all duration-700 ${
            hasEntered ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
          }`}
          style={{ transform: 'translateZ(55px)' }}
        >
          <Lock className="w-3 h-3 text-lime" />
          <span>Version Set A • Locked</span>
        </div>

        {/* ── MULTI-DIRECTIONAL FLOATING OBJECT 3: Auto-Grade Tag (Slides in from Bottom-Left) ── */}
        <div
          className={`absolute -bottom-3 left-2 sm:left-4 bg-surface border border-forest/30 text-ink px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-pill text-[10px] sm:text-[11px] font-heading font-bold shadow-xl flex items-center gap-1.5 z-40 pointer-events-none transition-all duration-700 ${
            hasEntered ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
          }`}
          style={{ transform: 'translateZ(50px)' }}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
          <span>Auto-Grade 100% Active</span>
        </div>
      </div>
    </div>
  );
};
