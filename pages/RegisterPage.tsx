import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import AuthFullScreenLayout from '../components/AuthFullScreenLayout';
import FormField from '../components/FormField';
import { useWebAuth } from '../context/WebAuthContext';
import { useToast } from '../context/ToastContext';
import { isValidEmail } from '../utils/authForm';

interface RegisterPageProps {
  onBack: () => void;
  onSuccess: () => void;
  onGoLogin?: () => void;
  /** Referrer id captured from the `?ref=` link. */
  refId?: string;
  /** Welcome bonus captured from the `?bonus=` link. */
  bonus?: number | null;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onBack, onSuccess, onGoLogin, refId = '', bonus = null }) => {
  const { register } = useWebAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passError, setPassError] = useState<string | null>(null);
  const [confirmPassError, setConfirmPassError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPassError(null);
    setConfirmPassError(null);
    const em = email.trim().toLowerCase();
    const pw = password;
    const cpw = confirmPassword;
    let hasError = false;
    if (!em) { setEmailError('Please enter your email'); hasError = true; }
    else if (!isValidEmail(em)) { setEmailError('Invalid email address'); hasError = true; }
    if (!pw) { setPassError('Please enter your password'); hasError = true; }
    else if (pw.length < 6) { setPassError('Password must be at least 6 characters'); hasError = true; }
    if (!cpw) { setConfirmPassError('Please confirm your password'); hasError = true; }
    else if (pw !== cpw) { setConfirmPassError('Passwords do not match'); hasError = true; }

    if (hasError) return;

    setLoading(true);
    try {
      const { ok, error } = await register(em, pw, '', refId, bonus);
      if (ok) {
        toast.show('Registration successful', 'success');
        onSuccess();
      } else {
        const msg = error || 'Registration failed';
        toast.show(msg, 'error');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      toast.show(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFullScreenLayout
      onBack={onBack}
      title="Create Account"
      subtitle="Register with your email to start trading"
    >
      <form onSubmit={handleSubmit} className="space-y-5 mt-4">
        <FormField
          id="reg-email"
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
          id="reg-pass"
          type="password"
          autoComplete="new-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Please enter your password"
          error={passError}
        />

        <FormField
          id="reg-confirm-pass"
          type="password"
          autoComplete="new-password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Please confirm your password"
          error={confirmPassError}
        />

        <div className="pt-6">
          <button type="submit" disabled={loading} className="btn-cta-full flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : null}
            Sign Up
          </button>
        </div>

        <p className="text-center text-[13px] text-textSecondary pt-6">
          Already have an account?{' '}
          <button type="button" className="text-accent font-medium" onClick={onGoLogin}>
            Log In
          </button>
        </p>
      </form>
    </AuthFullScreenLayout>
  );
};

export default RegisterPage;
