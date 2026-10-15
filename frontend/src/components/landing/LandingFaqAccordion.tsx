import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    question: 'Can our teachers print physical question papers for classroom exams?',
    answer:
      'Yes, absolutely! QuestionGen generates publication-quality print layouts ready for standard school printers. Each printed sheet includes official school headers, student instructions, section breakdowns, and clear mark allocations.',
  },
  {
    question: 'How does QuestionGen prevent question leaks and cheating?',
    answer:
      'With our 1-click Version Cloning feature, teachers can create multiple alternate sets (such as Set A and Set B) with the exact same difficulty, topics, and total marks. For online tests, our proctoring mode tracks tab switching and screen focus to encourage honest sittings.',
  },
  {
    question: 'Does the system automatically evaluate and grade student answers?',
    answer:
      'Yes! All multiple-choice and objective questions are graded instantly the moment a student submits their test. For subjective and written answers, teachers use a streamlined grading screen to award marks and personalized feedback in just a few clicks.',
  },
  {
    question: 'Can our school add our own questions and textbooks?',
    answer:
      'Yes. Teachers and curriculum staff can easily enter custom school questions or upload textbook PDFs. To ensure high quality, submissions can pass through your school’s verification queue before appearing in test creation.',
  },
  {
    question: 'How are student and teacher accounts created?',
    answer:
      'School Administrators can import all student and faculty rosters in seconds using standard Excel spreadsheets. The system automatically sets up secure accounts and organizes students by class and section.',
  },
];

export const LandingFaqAccordion: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0); // First one open by default

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="space-y-3.5 max-w-3xl mx-auto">
      {FAQS.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={idx}
            className={`rounded-card border transition-all duration-200 overflow-hidden ${
              isOpen
                ? 'bg-surface border-forest/30 shadow-md ring-1 ring-forest/10'
                : 'bg-surface/80 border-border hover:border-forest/20'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(idx)}
              className="w-full py-4 px-5 sm:px-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
              aria-expanded={isOpen}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-forest/10 text-forest flex items-center justify-center shrink-0">
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
                <span className="font-heading font-semibold text-sm sm:text-base text-ink">
                  {faq.question}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-ink/50 transition-transform duration-200 shrink-0 ${
                  isOpen ? 'rotate-180 text-forest' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-5 sm:px-6 pb-5 pt-1 text-xs sm:text-sm text-ink/75 leading-relaxed font-body border-t border-border/40">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
