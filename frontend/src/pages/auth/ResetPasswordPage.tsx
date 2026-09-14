import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { KeyRound, Check, AlertCircle, Loader2, ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react';
import { MOTION } from '../../lib/motion';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const uidFromQuery = searchParams.get('uid') || '';
  const tokenFromQuery = searchParams.get('token') || '';
  const hasTokens = Boolean(uidFromQuery && tokenFromQuery);

  // Request Reset Link State (Unauthenticated / Forgot Password)
  const [requestEmail, setRequestEmail] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Confirm Reset Password State (Clicked link in email)
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Handle Request Reset Link (Step 1: Enter email)
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError(null);

    const trimmedEmail = requestEmail.trim();
    if (!trimmedEmail) {
      setRequestError('Please enter your email address.');
      return;
    }

    setIsRequesting(true);
    try {
      await authApi.requestPasswordReset(trimmedEmail);
      setRequestSuccess(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.email?.[0] ||
        'Unable to send reset email. Please verify your email and try again.';
      setRequestError(msg);
    } finally {
      setIsRequesting(false);
    }
  };

  // Handle Confirm New Password (Step 2: Set new password with token from link)
  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);

    if (!uidFromQuery || !tokenFromQuery) {
      setConfirmError('Missing security token or user identifier. Please request a new link.');
      return;
    }

    if (newPassword.length < 8) {
      setConfirmError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setConfirmError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset({
        uid: uidFromQuery,
        token: tokenFromQuery,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setConfirmSuccess(true);
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2500);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.detail ||
        data?.token?.[0] ||
        data?.new_password?.[0] ||
        data?.confirm_password?.[0] ||
        data?.non_field_errors?.[0] ||
        'Password reset failed. The link may be expired or invalid.';
      setConfirmError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestNewLink = () => {
    setSearchParams({});
    setConfirmError(null);
    setRequestSuccess(false);
    setRequestEmail('');
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-xl shadow-xl p-8 space-y-6 animate-card-enter">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-card bg-forest text-white mx-auto flex items-center justify-center shadow-sm">
            {hasTokens ? <KeyRound className="w-6 h-6" /> : <Mail className="w-6 h-6" />}
          </div>
          <h1 className="font-heading font-bold text-2xl text-ink tracking-tight">
            {hasTokens ? 'Reset Your Password' : 'Forgot Password?'}
          </h1>
          <p className="text-xs text-ink/65 max-w-xs mx-auto">
            {hasTokens
              ? 'Choose a strong new password for your account.'
              : "Enter your registered email address and we'll send you a secure link to reset your password."}
          </p>
        </div>

        {/* MODE A: User arrived without tokens (Forgot Password - Request Email) */}
        {!hasTokens && (
          <>
            {requestSuccess ? (
              <div className="p-4 rounded-card bg-forest/10 border border-forest/30 text-center space-y-3">
                <div className="w-9 h-9 rounded-full bg-forest text-white mx-auto flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-forest">Password Reset Email Dispatched</p>
                  <p className="text-[11px] text-ink/75 leading-relaxed">
                    If an active account exists for <span className="font-semibold text-ink">{requestEmail}</span>, a secure password reset link has been sent to your inbox.
                  </p>
                  <p className="text-[10px] text-ink/50 pt-1">
                    Please check your spam or junk folder if the email does not appear within a few minutes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRequestSuccess(false)}
                  className="mt-2 text-xs font-heading font-semibold text-forest hover:underline cursor-pointer"
                >
                  Send to a different email &rarr;
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestSubmit} className="space-y-4">
                {requestError && (
                  <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{requestError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="reset-email" className="block text-xs font-heading font-semibold text-ink">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      placeholder="e.g. user@school.edu"
                      className="w-full pl-9 pr-3 py-2.5 text-xs rounded-card border border-border bg-surface text-ink placeholder:text-ink/30 focus:border-forest focus:outline-none"
                    />
                    <Mail className="w-4 h-4 text-ink/40 absolute left-3 top-3" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isRequesting}
                  className={`w-full py-2.5 px-4 rounded-pill bg-forest text-white font-heading font-semibold text-xs hover:bg-forest/90 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${MOTION.touch.button.className}`}
                >
                  {isRequesting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>
              </form>
            )}
          </>
        )}

        {/* MODE B: User arrived via reset link with uid & token in URL */}
        {hasTokens && (
          <>
            {confirmSuccess ? (
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
              <form onSubmit={handleConfirmSubmit} className="space-y-4">
                {confirmError && (
                  <div className="p-3 rounded-card bg-ember/10 border border-ember/30 text-xs text-ember flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{confirmError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestNewLink}
                      className="text-[11px] font-semibold text-forest underline text-left hover:text-forest/80 cursor-pointer"
                    >
                      Request a new password reset link &rarr;
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label htmlFor="new-password" className="text-xs font-semibold text-ink">New Password</label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
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
                  <label htmlFor="confirm-password" className="text-xs font-semibold text-ink">Confirm New Password</label>
                  <div className="relative">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      placeholder="Re-enter password"
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
          </>
        )}

        {/* Return to Login */}
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
