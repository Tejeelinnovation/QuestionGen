import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { KeyRound, Check, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { MOTION } from '../../lib/motion';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const uidFromQuery = searchParams.get('uid') || '';
  const tokenFromQuery = searchParams.get('token') || '';

  const [uid, setUid] = useState(uidFromQuery);
  const [token, setToken] = useState(tokenFromQuery);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!uid || !token) {
      setError('Missing security token or user identifier. Please use the link sent to your email.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset({
        uid,
        token,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setIsSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2500);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.detail ||
        data?.token?.[0] ||
        data?.new_password?.[0] ||
        'Password reset failed. The link may be expired or invalid.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-xl shadow-xl p-8 space-y-6 animate-card-enter">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-card bg-forest text-white mx-auto flex items-center justify-center shadow-sm">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
            Reset Your Password
          </h1>
          <p className="text-xs text-ink/65 max-w-xs mx-auto">
            Choose a strong new password for your account.
          </p>
        </div>

        {isSuccess ? (
          <div className="p-4 rounded-card bg-forest/10 border border-forest/30 text-center space-y-2">
            <div className="w-8 h-8 rounded-full bg-forest text-white mx-auto flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-forest">Password reset successfully!</p>
            <p className="text-[11px] text-ink/70">
              Redirecting you to the login screen in a few seconds...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {(!uidFromQuery || !tokenFromQuery) && (
              <div className="space-y-3 p-3 bg-surface-muted/50 rounded-card border border-border">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">User Token ID (UID)</label>
                  <input
                    type="text"
                    required
                    value={uid}
                    onChange={(e) => setUid(e.target.value)}
                    placeholder="Base64 UID from reset link"
                    className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Security Token</label>
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Reset token string"
                    className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden font-mono"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink">Confirm New Password</label>
              <input
                type="password"
                required
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-3 py-2 text-xs rounded-card border border-border bg-surface text-ink focus:border-forest focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${MOTION.touch.button.className}`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Confirm & Reset Password</span>
              )}
            </button>
          </form>
        )}

        <div className="pt-2 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-ink/70 hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Login</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
