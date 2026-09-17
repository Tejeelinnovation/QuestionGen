import React, { useState, useEffect } from 'react';
import { auditApi, type AuditLogItem } from '../../api/audit';
import { useAuth } from '../../auth/AuthContext';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  FileText,
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  Eye,
  X,
  GraduationCap,
} from 'lucide-react';
import { Pagination } from '../ui/pagination';

export const SuperAdminAuditLogViewer: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await auditApi.getLogs({
        category: selectedCategory,
        search: debouncedSearch.trim() || undefined,
        page: currentPage,
        page_size: pageSize,
      });
      setLogs(data.results);
      setTotalCount(data.count);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [currentPage, pageSize, selectedCategory, debouncedSearch]);

  const formatTimestamp = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatFullTimestamp = (dateStr?: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const getCategoryBadge = (category?: string) => {
    switch (category) {
      case 'PROCTORING':
        return 'pill-ember';
      case 'EXAMS':
        return 'pill-forest';
      case 'PAPERS':
        return 'pill-grape';
      case 'USERS':
        return 'pill-lime';
      default:
        return 'pill-muted';
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'PROCTORING':
        return <ShieldAlert className="w-3.5 h-3.5 text-ember" />;
      case 'EXAMS':
        return <GraduationCap className="w-3.5 h-3.5 text-forest" />;
      case 'PAPERS':
        return <FileText className="w-3.5 h-3.5 text-grape" />;
      case 'USERS':
        return <User className="w-3.5 h-3.5 text-forest" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-ink/50" />;
    }
  };

  const formatSummary = (log: AuditLogItem) => {
    const meta = log.metadata || {};
    const action = log.action || log.event_type || '';
    const category = log.category || '';

    if (category === 'PROCTORING' || action.includes('proctoring')) {
      const reason = meta.event_type || meta.reason || 'Integrity warning';
      const warningCount = meta.warning_count ?? log.target_id;
      return (
        <span className="text-ember font-medium">
          Exam Violation: <strong>{reason}</strong> (Warning #{warningCount})
        </span>
      );
    }

    if (action === 'user.login') {
      return <span>User logged into the platform</span>;
    }

    if (action === 'user.logout') {
      return <span>User logged out of session</span>;
    }

    if (action === 'user.profile_updated') {
      return <span>User profile updated for @{meta.username || log.actor?.username || log.target_id}</span>;
    }

    if (action === 'user.created') {
      return <span>New user created: @{meta.username || log.target_id}</span>;
    }

    if (action === 'user.password_changed') {
      return <span>Password updated</span>;
    }

    if (action === 'user.password_reset_requested') {
      return <span>Password reset link requested</span>;
    }

    if (action === 'user.password_reset_confirmed') {
      return <span>Password reset successfully confirmed</span>;
    }

    if (action.startsWith('capability.')) {
      return <span>Permissions & capabilities updated</span>;
    }

    if (action === 'paper.created') {
      return (
        <span>
          Paper Created: <strong>{meta.title || meta.paper_title || `Paper #${log.target_id}`}</strong>
          {meta.total_marks ? ` (${meta.total_marks} Marks)` : ''}
        </span>
      );
    }

    if (action === 'paper.cloned') {
      return (
        <span>
          Paper Cloned: <strong>{meta.title || meta.paper_title || `Paper #${log.target_id}`}</strong>
        </span>
      );
    }

    if (action === 'version.created') {
      return (
        <span>
          Paper Version Created: <strong>{meta.title || `Version #${log.target_id}`}</strong>
        </span>
      );
    }

    if (action === 'delivery.created') {
      return <span>Exam Delivery Scheduled</span>;
    }

    if (action === 'attempt.started') {
      return (
        <span>
          Exam Started: <strong>{meta.test_title || meta.paper_title || `Attempt #${log.target_id}`}</strong>
        </span>
      );
    }

    if (action === 'attempt.submitted') {
      return (
        <span>
          Exam Completed: <strong>{meta.test_title || `Attempt #${log.target_id}`}</strong>
          {meta.duration_minutes ? ` in ${meta.duration_minutes}m` : ''}
        </span>
      );
    }

    if (action === 'answer.graded') {
      return <span>Answer Graded for Question #{meta.question_id || log.target_id}</span>;
    }

    const formattedAction = action
      ? action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'System Event';

    return <span className="font-mono text-ink/80">{formattedAction}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-5 shadow-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-semibold text-ink/65 uppercase tracking-wider">
              Total Audit Logs
            </span>
            <Clock className="w-4 h-4 text-ink/40" />
          </div>
          <div className="font-heading font-bold text-2xl text-ink">{totalCount}</div>
          <p className="text-[11px] text-ink/50 font-mono">Real-time immutable ledger</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-semibold text-ember uppercase tracking-wider">
              Anti-Cheating Warnings
            </span>
            <ShieldAlert className="w-4 h-4 text-ember" />
          </div>
          <div className="font-heading font-bold text-2xl text-ember">Active Proctoring</div>
          <p className="text-[11px] text-ink/50 font-mono">Tab switch & inspect telemetry</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-semibold text-forest uppercase tracking-wider">
              Exam Sittings
            </span>
            <GraduationCap className="w-4 h-4 text-forest" />
          </div>
          <div className="font-heading font-bold text-2xl text-forest">Start & End Sessions</div>
          <p className="text-[11px] text-ink/50 font-mono">Recorded student submissions</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 shadow-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-heading font-semibold text-grape uppercase tracking-wider">
              Paper Generation
            </span>
            <FileText className="w-4 h-4 text-grape" />
          </div>
          <div className="font-heading font-bold text-2xl text-grape">Teacher Blueprints</div>
          <p className="text-[11px] text-ink/50 font-mono">Rubric & marks configuration</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-surface border border-border rounded-lg p-6 shadow-card space-y-5">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="font-heading font-bold text-xl text-ink">System Audit Trail & Proctoring Log</h2>
            <p className="text-xs text-ink/65 mt-0.5">
              Tracks paper creation timestamps, exam start/finish times, student anti-cheating alerts, and security changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 rounded-pill border border-border bg-surface text-ink/70 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              title="Refresh log feed"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-forest' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: 'ALL', label: 'All Logs' },
              { key: 'PROCTORING', label: 'Proctoring & Cheating' },
              { key: 'EXAMS', label: 'Exam Sessions' },
              { key: 'PAPERS', label: 'Paper Creation' },
              { key: 'USERS', label: 'User Security' },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.key);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-heading font-semibold rounded-pill transition-all cursor-pointer ${
                  selectedCategory === cat.key
                    ? 'bg-forest text-white shadow-2xs'
                    : 'bg-surface border border-border text-ink/70 hover:text-ink hover:bg-surface-muted'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-ink/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actor, event, or metadata..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-pill border border-border bg-bg text-ink focus:border-forest focus:outline-hidden"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-muted/50 font-heading text-[11px] font-semibold text-ink uppercase tracking-wider">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Actor / User</th>
                <th className="py-3 px-4">Event Description</th>
                <th className="py-3 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-ink/50">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-forest mb-2" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-ink/50 space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-forest mx-auto mb-1" />
                    <p className="font-heading font-semibold text-ink">No audit entries found</p>
                    <p className="text-[11px]">No matching events recorded for the current filter criteria.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-surface-muted/40 transition-colors group cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    {/* Timestamp */}
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-ink/75">
                      {formatTimestamp(log.created_at || log.timestamp)}
                    </td>

                    {/* Category */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`pill ${getCategoryBadge(log.category)} text-[10px] inline-flex items-center gap-1`}
                      >
                        {getCategoryIcon(log.category)}
                        <span>{log.category || 'SYSTEM'}</span>
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      {log.actor ? (
                        (() => {
                          const isYou = Boolean(
                            currentUser && (
                              (log.actor.id && String(currentUser.id) === String(log.actor.id)) ||
                              (log.actor.username && currentUser.username.toLowerCase() === log.actor.username.toLowerCase())
                            )
                          );
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-medium ${isYou ? 'text-forest font-semibold' : 'text-ink'}`}>
                                @{log.actor.username}
                              </span>
                              {isYou && (
                                <span className="px-1.5 py-0.2 rounded-pill bg-forest/15 border border-forest/30 text-forest text-[9px] font-bold">
                                  You
                                </span>
                              )}
                              {(log.actor.role_label || log.actor.role) && (
                                <span className="text-[10px] text-ink/40 font-mono">
                                  ({log.actor.role_label || log.actor.role})
                                </span>
                              )}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-ink/40 font-mono italic">System Core</span>
                      )}
                    </td>

                    {/* Event Description */}
                    <td className="py-3 px-4">
                      <div className="text-xs text-ink">{formatSummary(log)}</div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-pill border border-border bg-surface text-ink hover:border-forest hover:text-forest transition-colors cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="pt-2">
            <Pagination
              currentPage={currentPage}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              itemName="audit records"
            />
          </div>
        )}
      </div>

      {/* Inspect Modal Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-border rounded-xl shadow-2xl max-w-xl w-full overflow-hidden animate-card-enter">
            <div className="flex items-center justify-between p-5 border-b border-border bg-surface-muted/30">
              <div className="flex items-center gap-2">
                <span className={`pill ${getCategoryBadge(selectedLog.category)} text-xs`}>
                  {selectedLog.category || 'SYSTEM'}
                </span>
                <span className="font-mono text-xs text-ink/50">ID #{selectedLog.id}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-pill text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="space-y-1">
                <h3 className="font-heading font-bold text-lg text-ink">
                  {selectedLog.event_type || selectedLog.action || 'Audit Record'}
                </h3>
                <p className="text-xs text-ink/65">
                  Target: <strong className="font-mono">{selectedLog.target_type} #{selectedLog.target_id}</strong>
                </p>
              </div>

              {/* Actor & Timestamp Grid */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-card bg-surface-muted/40 border border-border text-xs font-mono">
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">Actor Username</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-ink font-semibold">
                      {selectedLog.actor ? `@${selectedLog.actor.username}` : 'System'}
                    </span>
                    {currentUser && selectedLog.actor && (
                      (selectedLog.actor.id && String(currentUser.id) === String(selectedLog.actor.id)) ||
                      (selectedLog.actor.username && currentUser.username.toLowerCase() === selectedLog.actor.username.toLowerCase())
                    ) && (
                      <span className="px-1.5 py-0.2 rounded-pill bg-forest/15 border border-forest/30 text-forest text-[9px] font-bold">
                        You
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">Actor Role</span>
                  <span className="text-ink font-semibold">
                    {selectedLog.actor?.role_label || selectedLog.actor?.role || 'Core Service'}
                  </span>
                </div>
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">Timestamp</span>
                  <span className="text-ink font-medium">
                    {formatFullTimestamp(selectedLog.created_at || selectedLog.timestamp)}
                  </span>
                </div>
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">IP Address</span>
                  <span className="text-ink font-medium">
                    {selectedLog.ip_address || selectedLog.metadata?.ip || selectedLog.metadata?.ip_address || '127.0.0.1'}
                  </span>
                </div>
              </div>

              {/* Proctoring telemetry highlights */}
              {selectedLog.category === 'PROCTORING' && selectedLog.metadata && (
                <div className="p-4 rounded-card bg-ember/10 border border-ember/30 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-ember">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Anti-Cheating Proctoring Violation</span>
                  </div>
                  <div className="space-y-1 text-ink/80">
                    <p>
                      <strong>Violation Type:</strong> {selectedLog.metadata.event_type || 'Unknown'}
                    </p>
                    <p>
                      <strong>Warning Triggered:</strong> Count #{selectedLog.metadata.warning_count}
                    </p>
                    {selectedLog.metadata.note && (
                      <p>
                        <strong>Detail:</strong> {selectedLog.metadata.note}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Raw Metadata JSON */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-ink/75 block">
                  Event Telemetry Payload (JSON)
                </span>
                <pre className="p-3.5 rounded-card bg-bg border border-border font-mono text-[11px] text-ink/90 overflow-x-auto max-h-56 leading-relaxed">
                  {JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end bg-surface-muted/20">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 text-xs font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
