import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import AuthFullScreenLayout from '../components/AuthFullScreenLayout';
import BottomSheet from '../components/BottomSheet';
import FormField from '../components/FormField';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';
import { isValidEmail } from '../utils/authForm';

interface LoginPageProps {
  onBack: () => void;
  onSuccess: () => void;
  onGoRegister?: () => void;
  onGoSupport?: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onBack, onSuccess, onGoRegister, onGoSupport }) => {
  const { login, resendEmailConfirmation } = useWebAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [showForgotSheet, setShowForgotSheet] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setEmailError(null);
    setPassError(null);
    const em = email.trim().toLowerCase();
    const pw = password;
    let hasError = false;
    if (!em) { setEmailError('Please enter your email'); hasError = true; }
    else if (!isValidEmail(em)) { setEmailError('Invalid email address'); hasError = true; }
    if (!pw) { setPassError('Please enter your password'); hasError = true; }
    if (hasError) return;

    setLoading(true);
    try {
      const { ok, error } = await login(em, pw);
      if (ok) {
        onSuccess();
      } else {
        const msg = error || 'Login failed';
        toast.show(msg, 'error');
        setLoginError(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      toast.show(msg, 'error');
      setLoginError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isEmailConfirmError = loginError?.toLowerCase().includes('confirm')
    || loginError?.toLowerCase().includes('not confirmed');

  return (
    <>
      <AuthFullScreenLayout
        onBack={onBack}
        title="Log In"
      >
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <FormField
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Please enter your email"
            error={emailError}
          />

          <FormField
            id="login-pass"
            type="password"
            autoComplete="current-password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Please enter your password"
            error={passError}
          />

          <div className="flex justify-end pt-2">
            <button
              type="button"
              className="text-[13px] text-accent hover:text-accent/80 font-medium"
              onClick={() => setShowForgotSheet(true)}
            >
              Forgot Password?
            </button>
          </div>

          {isEmailConfirmError && (
            <div className="rounded-xl bg-card app-border px-4 py-3 mt-4">
              <p className="text-[13px] text-textPrimary">{loginError}</p>
              <button
                type="button"
                disabled={resending || !resendEmailConfirmation}
                onClick={async () => {
                  setResending(true);
                  const res = await resendEmailConfirmation?.(email);
                  setResending(false);
                  if (!res?.ok) toast.show(res?.error || 'Error', 'error');
                  else toast.show('Verification email resent', 'success');
                }}
                className="mt-2 text-[13px] font-medium text-accent hover:underline disabled:opacity-50"
              >
                {resending ? 'Resending...' : 'Resend Email'}
              </button>
            </div>
          )}

          <div className="pt-4">
            <button type="submit" disabled={loading} className="app-button-primary w-full">
              {loading ? <Loader2 className="animate-spin" size={18} /> : null}
              Log In
            </button>
          </div>

          <p className="text-center text-[13px] text-textSecondary pt-6">
            Don't have an account?{' '}
            <button type="button" className="text-accent font-medium" onClick={onGoRegister}>
              Sign Up
            </button>
          </p>
        </form>
      </AuthFullScreenLayout>

      <BottomSheet
        open={showForgotSheet}
        onClose={() => setShowForgotSheet(false)}
        title="Forgot Password"
        closeOnBackdrop
      >
        <p className="text-[14px] text-textSecondary leading-relaxed mb-6">
          To reset your password, please contact our support team.
        </p>
        <button
          type="button"
          onClick={() => {
            setShowForgotSheet(false);
            onGoSupport?.();
          }}
          className="app-button-primary w-full"
        >
          Contact Support
        </button>
      </BottomSheet>
    </>
  );
};

export default LoginPage;
