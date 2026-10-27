import React, { useState, useEffect } from 'react';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { benchmarksApi, type BenchmarkResultsResponse } from '../../api/benchmarks';
import { BenchmarkResultsDesktop } from './BenchmarkResultsDesktop';
import { BenchmarkResultsTablet } from './BenchmarkResultsTablet';
import { BenchmarkResultsMobile } from './BenchmarkResultsMobile';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export const BenchmarkResultsPage: React.FC = () => {
  const breakpoint = useBreakpoint();
  const [data, setData] = useState<BenchmarkResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBenchmarkData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await benchmarksApi.getResults();
      setData(res);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          'Failed to load benchmark evaluation results.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBenchmarkData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 space-y-3 font-body">
        <Loader2 className="w-8 h-8 text-forest animate-spin" />
        <span className="text-xs font-mono text-ink/50 uppercase tracking-widest">
          Loading Empirical Benchmark Data...
        </span>
      </div>
    );
  }

  if (error || !data || !data.available) {
    return (
      <div className="max-w-md mx-auto my-16 bg-surface border border-border rounded-card p-8 text-center space-y-4 shadow-card font-body animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-ember/10 border border-ember/20 text-ember flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="font-heading font-bold text-lg text-ink">
            {data?.message || 'Benchmark Data Unavailable'}
          </h2>
          <p className="text-xs text-ink/60">
            {error || 'No benchmark evaluation runs have been recorded in the benchmark_results folder yet.'}
          </p>
        </div>
        <button
          onClick={fetchBenchmarkData}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  if (breakpoint === 'mobile') {
    return <BenchmarkResultsMobile data={data} onRefresh={fetchBenchmarkData} key="mobile" />;
  }

  if (breakpoint === 'tablet') {
    return <BenchmarkResultsTablet data={data} onRefresh={fetchBenchmarkData} key="tablet" />;
  }

  return <BenchmarkResultsDesktop data={data} onRefresh={fetchBenchmarkData} key="desktop" />;
};
