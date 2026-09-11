import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { authApi } from '../../api/auth';
import { X, Check, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { MOTION } from '../../lib/motion';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [primarySubject, setPrimarySubject] = useState(user?.primary_subject || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isTeacher = user?.role_label === 'Teacher';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await authApi.updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        ...(isTeacher ? { primary_subject: primarySubject.trim() } : {}),
      });
      await refreshUser();
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'Failed to update profile. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface border border-border rounded-xl shadow-xl max-w-lg w-full overflow-hidden animate-card-enter">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface-muted/30">
          <div>
            <h3 className="font-heading font-bold text-lg text-ink">Edit Profile Details</h3>
            <p className="text-xs text-ink/65 mt-0.5">
              Update personal identity fields. Core administrative fields are governed by the school.
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-pill text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-card bg-forest/10 border border-forest/30 text-xs text-forest flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Editable Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
              />
            </div>
          </div>

          {/* Teacher Subject */}
          {isTeacher && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">Teaching Subject Specialization</label>
              <input
                type="text"
                value={primarySubject}
                onChange={(e) => setPrimarySubject(e.target.value)}
                placeholder="e.g. Mathematics, Science"
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
              />
            </div>
          )}

          {/* Administrative Locked Fields notice */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-ink/75">
              <Lock className="w-3.5 h-3.5 text-ember" />
              <span>Protected Institutional Attributes (Read-Only)</span>
            </div>

            <div className="bg-surface-muted/40 p-3 rounded-card border border-border/60 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">Email</span>
                  <span className="text-ink font-medium truncate block">{user?.email || 'None'}</span>
                </div>
                <div>
                  <span className="text-ink/50 block text-[10px] uppercase">Mobile Number</span>
                  <span className="text-ink font-medium">{user?.mobile_number || 'None'}</span>
                </div>
                {user?.gr_number && (
                  <div>
                    <span className="text-ink/50 block text-[10px] uppercase">GR Number</span>
                    <span className="text-ink font-medium">{user.gr_number}</span>
                  </div>
                )}
                {user?.class_section_name && (
                  <div>
                    <span className="text-ink/50 block text-[10px] uppercase">Class</span>
                    <span className="text-ink font-medium">{user.class_section_name}</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-ink/55 italic pt-1 border-t border-border/40">
                To update your registered email, mobile number, GR number or class section, contact your school administrator.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className={`px-5 py-2 text-xs font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${MOTION.touch.button.className}`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
