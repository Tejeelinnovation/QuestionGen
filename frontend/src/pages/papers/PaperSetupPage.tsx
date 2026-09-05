import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { contentApi } from '../../api/content';
import { papersApi } from '../../api/papers';
import type { Chapter } from '../../types';

export const PaperSetupPage: React.FC = () => {
  const navigate = useNavigate();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [chapterId, setChapterId] = useState<number | ''>('');

  const [isLoadingChapters, setIsLoadingChapters] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadChapters = async () => {
      setIsLoadingChapters(true);
      setErrorMessage(null);
      try {
        const data = await contentApi.getChapters();
        setChapters(data);
        if (data.length > 0) {
          setChapterId(data[0].id);
        }
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to load curriculum chapters from server.'
        );
      } finally {
        setIsLoadingChapters(false);
      }
    };

    loadChapters();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Paper title is required.');
      return;
    }
    if (!chapterId) {
      setErrorMessage('Please select a chapter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const paper = await papersApi.createPaper({
        title: title.trim(),
        instructions: instructions.trim(),
        chapter: Number(chapterId),
      });

      navigate(`/papers/${paper.id}/configure`);
    } catch (err: any) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.chapter?.[0] ||
        err.response?.data?.title?.[0] ||
        JSON.stringify(err.response?.data) ||
        'Failed to create paper.';
      setErrorMessage(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Create Question Paper (Step 1: Setup)</h1>
        <Link to="/dashboard/teacher" className="text-sm text-blue-600 underline">
          &larr; Teacher Dashboard
        </Link>
      </div>

      {isLoadingChapters && <div className="text-sm text-gray-600">Loading chapters...</div>}

      {errorMessage && (
        <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {errorMessage}
        </div>
      )}

      {!isLoadingChapters && (
        <form onSubmit={handleSubmit} className="border border-gray-300 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="paper-title">
              Paper Title *
            </label>
            <input
              id="paper-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Class 10 Mid-Term — Real Numbers"
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="paper-chapter">
              Curriculum Chapter *
            </label>
            <select
              id="paper-chapter"
              value={chapterId}
              onChange={(e) => setChapterId(Number(e.target.value))}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-3 py-2 text-sm bg-white"
              required
            >
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.book_title ? `[${c.book_title}] ` : ''}
                  {c.title} (Topics: {c.topic_count})
                </option>
              ))}
              {chapters.length === 0 && <option value="">No chapters available</option>}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="paper-instructions">
              Instructions / Notes
            </label>
            <textarea
              id="paper-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. All questions are compulsory. Time allowed: 60 minutes."
              rows={3}
              disabled={isSubmitting}
              className="w-full border border-gray-400 px-3 py-2 text-sm"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <Link
              to="/dashboard/teacher"
              className="border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              id="submit-paper-setup-btn"
              disabled={isSubmitting || chapters.length === 0}
              className="border border-gray-400 bg-gray-100 hover:bg-gray-200 px-4 py-2 text-sm font-medium cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Paper...' : 'Continue to Configuration &rarr;'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
