import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getCurrentSession, signIn as cognitoSignIn, signOut as cognitoSignOut, parseIdToken } from '@/lib/auth';
import type { User, UserRole } from '@/types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setSessionFromToken = useCallback((idToken: string) => {
    localStorage.setItem('idToken', idToken);
    setToken(idToken);

    const payload = parseIdToken(idToken);
    setUser({
      userId: payload.sub as string,
      email: (payload.email as string) || '',
      displayName: (payload.name as string) || (payload.email as string) || '',
      role: (payload['custom:role'] as UserRole) || 'EMPLOYEE',
      teamId: (payload['custom:teamId'] as string) || '',
      teamName: '',
    });
  }, []);

  useEffect(() => {
    getCurrentSession()
      .then((session) => {
        if (session) {
          setSessionFromToken(session.getIdToken().getJwtToken());
        }
      })
      .finally(() => setIsLoading(false));
  }, [setSessionFromToken]);

  const login = async (email: string, password: string) => {
    const session = await cognitoSignIn(email, password);
    setSessionFromToken(session.getIdToken().getJwtToken());
  };

  const logout = () => {
    cognitoSignOut();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
