import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { signUp, confirmSignUp } from '@/lib/auth';
import { Columns3 } from 'lucide-react';
import { toast } from 'sonner';

type Mode = 'login' | 'signup' | 'confirm';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [teamId, setTeamId] = useState('');
  const [confirmCode, setConfirmCode] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Signed in successfully');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp({ email, password, name, role, teamId });
      toast.success('Check your email for the confirmation code');
      setMode('confirm');
    } catch (err: any) {
      toast.error(err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmSignUp(email, confirmCode);
      toast.success('Email confirmed! Sign in now.');
      setMode('login');
    } catch (err: any) {
      toast.error(err.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'flex h-11 w-full rounded-lg border border-input bg-white px-4 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';
  const btnClass = 'inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-[hsl(189,94%,37%)] px-4 text-sm font-semibold text-white transition-all hover:bg-[hsl(189,94%,32%)] disabled:opacity-50';

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-[hsl(var(--sidebar-bg))] lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--sidebar-accent))]">
          <Columns3 className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-6 text-3xl font-bold text-white">Mini-Jira</h2>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-slate-400">
          Lightweight team task management. Assign tasks, track progress, and keep every team aligned.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(189,94%,37%)]">
              <Columns3 className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">Mini-Jira</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold">
              {mode === 'login' && 'Welcome back'}
              {mode === 'signup' && 'Create account'}
              {mode === 'confirm' && 'Confirm email'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === 'login' && 'Enter your credentials to access your account'}
              {mode === 'signup' && 'Fill in your details to get started'}
              {mode === 'confirm' && 'Enter the verification code sent to your email'}
            </p>
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => setMode('signup')} className="cursor-pointer font-medium text-primary hover:underline">Sign up</button>
              </p>
            </form>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required minLength={8} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>
                {role === 'EMPLOYEE' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Team ID</label>
                    <input type="text" value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="e.g. frontend" className={inputClass} required />
                  </div>
                )}
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading ? 'Creating account...' : 'Sign Up'}
              </button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('login')} className="cursor-pointer font-medium text-primary hover:underline">Sign in</button>
              </p>
            </form>
          )}

          {mode === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Confirmation Code</label>
                <input type="text" value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="Enter code" className={inputClass} required />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading ? 'Confirming...' : 'Confirm Email'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
