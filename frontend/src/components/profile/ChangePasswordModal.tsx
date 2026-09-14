import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { authApi } from '../../api/auth';
import { X, KeyRound, Check, AlertCircle, Loader2, Mail, Eye, EyeOff } from 'lucide-react';
import { MOTION } from '../../lib/motion';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'direct' | 'email'>('direct');

  // Direct Change State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directSuccess, setDirectSuccess] = useState<string | null>(null);

  // Email Reset Link State
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDirectChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setDirectError(null);
    setDirectSuccess(null);

    if (newPassword.length < 8) {
      setDirectError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setDirectError('New passwords do not match.');
      return;
    }

    setIsChanging(true);
    try {
      const res = await authApi.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setDirectSuccess(res.detail || 'Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      const data = err?.response?.data;
      const getFirstError = (val: any): string | null => {
        if (!val) return null;
        if (Array.isArray(val) && val.length > 0) return String(val[0]);
        if (typeof val === 'string') return val;
        return null;
      };

      const msg =
        data?.detail ||
        getFirstError(data?.current_password) ||
        getFirstError(data?.old_password) ||
        getFirstError(data?.new_password) ||
        getFirstError(data?.confirm_password) ||
        getFirstError(data?.new_password_confirm) ||
        getFirstError(data?.non_field_errors) ||
        'Failed to change password. Verify your current password and try again.';
      setDirectError(msg);
    } finally {
      setIsChanging(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      setLinkError('Your account has no registered email address. Contact school admin.');
      return;
    }
    setIsSendingLink(true);
    setLinkError(null);
    setLinkSuccess(null);

    try {
      const res = await authApi.requestPasswordReset(user.email);
      setLinkSuccess(
        res.detail || 'Password reset instructions have been dispatched to your email address.'
      );
    } catch (err: any) {
      setLinkError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'Failed to dispatch password reset request.'
      );
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-surface border border-border rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-card-enter">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-card bg-forest/15 text-forest flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-ink">Account Security</h3>
              <p className="text-xs text-ink/65">Update or reset your login credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-pill text-ink/50 hover:text-ink hover:bg-surface-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border bg-surface-muted/10 text-xs font-heading font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
              activeTab === 'direct'
                ? 'border-b-2 border-forest text-forest bg-surface font-bold'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            Change Password
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
              activeTab === 'email'
                ? 'border-b-2 border-forest text-forest bg-surface font-bold'
                : 'text-ink/60 hover:text-ink'
            }`}
          >
            Email Reset Link
          </button>
        </div>

        {/* Tab 1: Direct Password Change */}
        {activeTab === 'direct' && (
          <form onSubmit={handleDirectChange} className="p-6 space-y-4">
            {directError && (
              <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{directError}</span>
              </div>
            )}

            {directSuccess && (
              <div className="p-3 rounded-card bg-forest/10 border border-forest/30 text-xs text-forest flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{directSuccess}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">Current Password</label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-3 py-2 pr-9 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                  aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                  title={showOldPassword ? 'Hide password' : 'Show password'}
                >
                  {showOldPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 pr-9 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full px-3 py-2 pr-9 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors p-1 focus:outline-none cursor-pointer flex items-center justify-center rounded-sm"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

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
                disabled={isChanging}
                className={`px-5 py-2 text-xs font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${MOTION.touch.button.className}`}
              >
                {isChanging ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Update Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Email Reset Link */}
        {activeTab === 'email' && (
          <div className="p-6 space-y-4">
            {linkError && (
              <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{linkError}</span>
              </div>
            )}

            {linkSuccess && (
              <div className="p-3 rounded-card bg-forest/10 border border-forest/30 text-xs text-forest flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{linkSuccess}</span>
              </div>
            )}

            <div className="space-y-2 text-xs text-ink/75 leading-relaxed">
              <p>
                We can generate a secure single-use password reset link tied to your registered email
                address:
              </p>
              <div className="p-3 rounded-card bg-surface-muted/60 border border-border font-mono text-ink text-xs font-medium flex items-center gap-2">
                <Mail className="w-4 h-4 text-forest shrink-0" />
                <span className="truncate">{user?.email || 'No email registered'}</span>
              </div>
              <p className="text-[11px] text-ink/60">
                The link is cryptographically signed using standard token security and expires
                automatically.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-pill border border-border bg-surface text-ink hover:bg-surface-muted transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSendingLink || !user?.email}
                onClick={handleSendResetEmail}
                className={`px-5 py-2 text-xs font-semibold rounded-pill bg-forest text-white hover:bg-forest/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${MOTION.touch.button.className}`}
              >
                {isSendingLink ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Email...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Reset Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
