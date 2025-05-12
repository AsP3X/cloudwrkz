import { useState, useEffect, useCallback } from 'react';

type SessionUser = {
  id: string;
  email: string;
  lastActive: string;
};

type SessionState = {
  active: boolean;
  user?: SessionUser;
  error?: string;
};

export const useSession = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<SessionState>({
    active: false
  });

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions/active_session', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
        }
      });
      const data = await response.json();
      setSession(data);
    } catch (error) {
      console.error('Session check failed:', error);
      setSession({ active: false, error: 'Failed to check session' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async () => {
    localStorage.setItem('sessionToken', 'dummy-valid-token');
    await checkSession();
  }, [checkSession]);

  const logout = useCallback(async () => {
    localStorage.removeItem('sessionToken');
    await checkSession();
  }, [checkSession]);

  return { isLoading, session, login, logout };
};
