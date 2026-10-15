import React from 'react';
import { GraduationCap, Users, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AnimatedCounter } from './AnimatedCounter';
import { ScrollReveal } from './ScrollReveal';

export const LandingRoles: React.FC = () => {
  return (
    <section id="roles" className="py-12 sm:py-16 lg:py-24 border-t border-border/60 bg-bg">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* Real Metrics Banner with Animated Counters (Slides up on scroll) */}
        <ScrollReveal direction="up" duration={750}>
          <div className="bg-surface border border-border/80 rounded-card p-5 sm:p-7 lg:p-10 shadow-card mb-10 sm:mb-14">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-0 text-center md:divide-x md:divide-y-0 divide-border/60">
              <div className="p-3 sm:p-4 md:py-0 md:px-4 bg-bg/50 md:bg-transparent rounded-lg md:rounded-none border border-border/40 md:border-none">
                <div className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-forest">
                  <AnimatedCounter end={10000} suffix="+" duration={2000} />
                </div>
                <div className="font-body text-xs sm:text-sm text-ink/70 mt-1">Verified Questions</div>
              </div>
              <div className="p-3 sm:p-4 md:py-0 md:px-4 bg-bg/50 md:bg-transparent rounded-lg md:rounded-none border border-border/40 md:border-none">
                <div className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-ember">
                  <AnimatedCounter end={3} suffix=" Mins" duration={1400} />
                </div>
                <div className="font-body text-xs sm:text-sm text-ink/70 mt-1">Avg. Paper Assembly</div>
              </div>
              <div className="p-3 sm:p-4 md:py-0 md:px-4 bg-bg/50 md:bg-transparent rounded-lg md:rounded-none border border-border/40 md:border-none">
                <div className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-forest">
                  <AnimatedCounter end={100} suffix="%" duration={1600} />
                </div>
                <div className="font-body text-xs sm:text-sm text-ink/70 mt-1">Syllabus Alignment</div>
              </div>
              <div className="p-3 sm:p-4 md:py-0 md:px-4 bg-bg/50 md:bg-transparent rounded-lg md:rounded-none border border-border/40 md:border-none">
                <div className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-ink">
                  <span>Zero</span>
                </div>
                <div className="font-body text-xs sm:text-sm text-ink/70 mt-1">Manual MCQ Grading</div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Section Heading */}
        <ScrollReveal direction="down" delay={150} duration={700}>
          <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3 mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest shadow-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-forest" />
              Designed For Everyday School Life
            </div>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-ink tracking-tight">
              Built for the Entire School Community
            </h2>
            <p className="font-body text-xs sm:text-sm lg:text-base text-ink/70 leading-relaxed max-w-xl mx-auto">
              Every role in your school gets a clean, dedicated workspace designed specifically for their tasks.
            </p>
          </div>
        </ScrollReveal>

        {/* 3 Role Cards with Multi-Directional Entrance & Responsive Padding */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
          
          {/* Teachers Card (from left) */}
          <ScrollReveal direction="left" delay={100} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card flex flex-col justify-between hover:border-forest/40 transition-all">
              <div className="space-y-3 sm:space-y-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-bold">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink leading-snug">
                  For Subject Teachers
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Save hours on every test cycle. Assemble balanced papers without copying and pasting, print formatted papers with instructions, and grade descriptive answers easily.
                </p>
                <ul className="space-y-2 text-xs text-ink/80 pt-2 border-t border-border/40 font-body">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>Saves 5+ hours on test preparation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>Automatic mark calculation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>1-click Set A / Set B cloning</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border/40">
                <span className="font-mono text-[10px] sm:text-[11px] text-forest font-semibold bg-forest/5 px-2.5 py-1 rounded-pill border border-forest/15">
                  Teacher Workspace
                </span>
              </div>
            </div>
          </ScrollReveal>

          {/* Students Card (from bottom) */}
          <ScrollReveal direction="up" delay={250} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card flex flex-col justify-between hover:border-ember/40 transition-all">
              <div className="space-y-3 sm:space-y-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-ember/10 text-ember flex items-center justify-center font-bold">
                  <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink leading-snug">
                  For Students
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Experience clean, distraction-free test sessions. Answers auto-save in real-time so accidental disconnects never erase your hard work.
                </p>
                <ul className="space-y-2 text-xs text-ink/80 pt-2 border-t border-border/40 font-body">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ember shrink-0" />
                    <span>Automatic background answer saving</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ember shrink-0" />
                    <span>Live exam countdown timer</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-ember shrink-0" />
                    <span>Immediate objective scores</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border/40">
                <span className="font-mono text-[10px] sm:text-[11px] text-ember font-semibold bg-ember/5 px-2.5 py-1 rounded-pill border border-ember/15">
                  Student Examination Desk
                </span>
              </div>
            </div>
          </ScrollReveal>

          {/* Principals / Admins Card (from right) */}
          <ScrollReveal direction="right" delay={400} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card flex flex-col justify-between hover:border-forest/40 transition-all">
              <div className="space-y-3 sm:space-y-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink leading-snug">
                  For Principals & Coordinators
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Keep your institution’s academic assessments consistent, verified, and safely archived. Manage student and teacher rosters in bulk via Excel.
                </p>
                <ul className="space-y-2 text-xs text-ink/80 pt-2 border-t border-border/40 font-body">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>1-click Excel student bulk import</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>Centralized exam records & audit logs</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>Question bank quality validation</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-border/40">
                <span className="font-mono text-[10px] sm:text-[11px] text-forest font-semibold bg-forest/5 px-2.5 py-1 rounded-pill border border-forest/15">
                  Administrative Controls
                </span>
              </div>
            </div>
          </ScrollReveal>

        </div>
      </div>
    </section>
  );
};

