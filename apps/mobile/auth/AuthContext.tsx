import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import api from '@/lib/api';
import { storage } from '@/lib/storage';

type User = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const token = await storage.getItem('token');
        if (!token) {
          setLoading(false);
          return;
        }

        const res = await api.get('/api/auth/me');
        setUser(res.data.user);
      } catch {
        await storage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password });
    await storage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const register = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    const res = await api.post('/api/auth/register', data);
    await storage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const logout = async () => {
    await storage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};

