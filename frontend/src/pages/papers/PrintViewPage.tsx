import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { papersApi } from '../../api/papers';
import type { PaperPrintData } from '../../types';

export const PrintViewPage: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>();
  const paperId = Number(id);
  const vId = Number(versionId);

  const [printData, setPrintData] = useState<PaperPrintData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadPrintData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await papersApi.getPrintLayout(paperId, vId);
        setPrintData(data);
      } catch (err: any) {
        setErrorMessage(
          err.response?.data?.detail || 'Failed to generate printable test layout from server.'
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (paperId && vId) {
      loadPrintData();
    }
  }, [paperId, vId]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-gray-600">Generating print layout...</div>;
  }

  if (errorMessage || !printData) {
    return (
      <div className="p-4 space-y-4">
        {errorMessage && (
          <div className="border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
            {errorMessage}
          </div>
        )}
        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="text-blue-600 underline text-sm"
        >
          &larr; Back to Version Detail
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Non-printed action toolbar */}
      <div className="print:hidden border border-gray-300 p-3 bg-gray-50 flex justify-between items-center text-sm">
        <Link
          to={`/papers/${paperId}/versions/${vId}`}
          className="text-blue-600 underline"
        >
          &larr; Return to Version Detail
        </Link>

        <button
          onClick={handlePrint}
          id="trigger-print-btn"
          className="border border-gray-500 bg-white hover:bg-gray-100 px-4 py-2 font-medium cursor-pointer"
        >
          Print Paper (or Save to PDF)
        </button>
      </div>

      {/* Printable Sheet */}
      <div className="border border-gray-300 p-8 bg-white print:border-none print:p-0 space-y-6">
        {/* Exam Header */}
        <div className="border-b-2 border-black pb-4 text-center space-y-2">
          <h1 className="text-2xl font-bold uppercase tracking-wide">{printData.title}</h1>
          <div className="flex justify-between items-center text-sm pt-2 font-semibold">
            <span>Version: {printData.version_label}</span>
            <span>Total Questions: {printData.question_count}</span>
            <span>Maximum Marks: {printData.total_marks}</span>
          </div>
          {printData.instructions && (
            <p className="text-xs text-left italic border-t border-gray-200 pt-2 text-gray-700">
              <strong>Instructions:</strong> {printData.instructions}
            </p>
          )}
        </div>

        {/* Student Name/Date Header for in-person tests */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-gray-300 p-2">
          <div>Student Name: ____________________________________</div>
          <div>Roll No / ID: __________________ Date: ___________</div>
        </div>

        {/* Questions Section */}
        <div className="space-y-6 pt-2">
          {printData.questions?.map((q, idx) => (
            <div key={q.question_id || idx} className="space-y-2 text-sm break-inside-avoid">
              <div className="flex justify-between items-baseline font-medium">
                <span>
                  <strong>{idx + 1}.</strong> {q.question_text}
                </span>
                <span className="font-bold text-xs ml-4 whitespace-nowrap">
                  [{q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}]
                </span>
              </div>

              {/* MCQ Options */}
              {q.options && Object.keys(q.options).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs pl-4 pt-1">
                  {Object.entries(q.options).map(([key, val]) => (
                    <div key={key} className="flex items-baseline space-x-1">
                      <span className="font-bold">({key})</span>
                      <span>{val}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Writing space for short/long answers */}
              {q.question_type !== 'MCQ' && (
                <div className="h-16 border-b border-dashed border-gray-200 mt-2"></div>
              )}
            </div>
          ))}
        </div>

        {/* End of paper marker */}
        <div className="text-center text-xs text-gray-400 border-t border-gray-200 pt-4">
          *** END OF QUESTION PAPER ***
        </div>
      </div>
    </div>
  );
};
