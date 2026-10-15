import React from 'react';
import { BookOpen, Sliders, Printer, ArrowRight, Sparkles } from 'lucide-react';
import { ScrollReveal } from './ScrollReveal';

export const LandingFeatures: React.FC = () => {
  return (
    <section id="how-it-works" className="py-12 sm:py-16 lg:py-24 border-t border-border/60 bg-surface/40 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <ScrollReveal direction="down" duration={700}>
          <div className="text-center max-w-2xl mx-auto space-y-2.5 sm:space-y-3 mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface border border-border text-xs font-semibold text-forest shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-ember" />
              Simple 3-Step Process
            </div>
            <h2 className="font-heading font-bold text-2xl sm:text-3xl lg:text-4xl text-ink tracking-tight">
              Exam Preparation Made Simple
            </h2>
            <p className="font-body text-xs sm:text-sm lg:text-base text-ink/70 leading-relaxed max-w-xl mx-auto">
              Everything your school needs to assemble, print, and evaluate exams in a fraction of the time.
            </p>
          </div>
        </ScrollReveal>

        {/* 3 Simple Steps Grid with Responsive Spacing for Mobile & Tablet */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
          {/* Step 1: Slides in from the Left */}
          <ScrollReveal direction="left" delay={100} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card hover:shadow-lg transition-all duration-300 relative group flex flex-col justify-between">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center font-heading font-bold text-base sm:text-lg">
                    <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="font-mono text-xs font-bold text-ink/40 bg-bg px-2.5 py-1 rounded-pill border border-border">
                    Step 01
                  </span>
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink group-hover:text-forest transition-colors leading-snug">
                  Pick Your Syllabus & Class
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Choose your standard (Class 8 to 10), subject, and chapter. Instantly pull from verified textbook question banks mapped to CBSE and State curricula.
                </p>
              </div>
              <div className="pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-border/50 flex items-center gap-1.5 text-xs font-heading font-semibold text-forest">
                <span>Chapter & Topic Filters</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </ScrollReveal>

          {/* Step 2: Slides up from the Bottom */}
          <ScrollReveal direction="up" delay={250} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card hover:shadow-lg transition-all duration-300 relative group flex flex-col justify-between">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-ember/10 text-ember flex items-center justify-center font-heading font-bold text-base sm:text-lg">
                    <Sliders className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="font-mono text-xs font-bold text-ink/40 bg-bg px-2.5 py-1 rounded-pill border border-border">
                    Step 02
                  </span>
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink group-hover:text-ember transition-colors leading-snug">
                  Balance Your Blueprint
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Set your exact ratio of easy, medium, and challenging questions. The system checks total marks and lets you clone Set A and Set B in one click.
                </p>
              </div>
              <div className="pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-border/50 flex items-center gap-1.5 text-xs font-heading font-semibold text-ember">
                <span>1-Click Cheating Protection</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </ScrollReveal>

          {/* Step 3: Slides in from the Right */}
          <ScrollReveal direction="right" delay={400} duration={700} className="h-full">
            <div className="h-full bg-surface rounded-card p-5 sm:p-6 lg:p-7 border border-border/80 shadow-card hover:shadow-lg transition-all duration-300 relative group flex flex-col justify-between">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-lime/30 text-forest flex items-center justify-center font-heading font-bold text-base sm:text-lg">
                    <Printer className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <span className="font-mono text-xs font-bold text-ink/40 bg-bg px-2.5 py-1 rounded-pill border border-border">
                    Step 03
                  </span>
                </div>
                <h3 className="font-heading font-bold text-lg sm:text-xl text-ink group-hover:text-forest transition-colors leading-snug">
                  Print or Test Online
                </h3>
                <p className="font-body text-xs sm:text-sm text-ink/75 leading-relaxed">
                  Download ready-to-print question sheets formatted for school printers, or schedule online test sittings with instant automatic grading for multiple-choice questions.
                </p>
              </div>
              <div className="pt-4 sm:pt-6 mt-4 sm:mt-6 border-t border-border/50 flex items-center gap-1.5 text-xs font-heading font-semibold text-forest">
                <span>Instant Grading & Scores</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
};

