import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { io, type Socket } from 'socket.io-client';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, setInMemoryIdToken } from '../services/api.ts';
import type { AuthUser, UserRole } from '../types/index.ts';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  socket: Socket | null;
  isStaff: boolean;
  refreshUser: () => Promise<void>;
  signInWithGoogle: () => Promise<AuthUser>;
  loginWithPassword: (email: string, password: string) => Promise<AuthUser>;
  registerAccount: (payload: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    accountType: 'REGULAR' | 'B2B';
    companyName?: string;
    tinNumber?: string;
    industry?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STAFF_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'INVENTORY_MANAGER',
  'SALES_MANAGER',
  'WAREHOUSE_STAFF',
  'DELIVERY_MANAGER',
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  const refreshUser = async () => {
    try {
      const data = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    const s = io({ withCredentials: true });
    setSocket(s);

    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setInMemoryIdToken(token);
        } catch {
          setInMemoryIdToken(null);
        }
      } else {
        setInMemoryIdToken(null);
      }

      if (!settled) {
        settled = true;
        await refreshUser();
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      s.disconnect();
    };
  }, []);

  const signInWithGoogle = async (): Promise<AuthUser> => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    setInMemoryIdToken(idToken);
    const data = await apiFetch<{ user: AuthUser }>('/api/auth/google-sync', {
      method: 'POST',
    });
    setUser(data.user);
    return data.user;
  };

  const loginWithPassword = async (
    email: string,
    password: string
  ): Promise<AuthUser> => {
    const data = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data.user;
  };

  const registerAccount = async (payload: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    accountType: 'REGULAR' | 'B2B';
    companyName?: string;
    tinNumber?: string;
    industry?: string;
  }): Promise<AuthUser> => {
    const data = await apiFetch<{ user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore
    }
    setInMemoryIdToken(null);
    setUser(null);
  };

  const isStaff = Boolean(user && STAFF_ROLES.includes(user.role));

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        socket,
        isStaff,
        refreshUser,
        signInWithGoogle,
        loginWithPassword,
        registerAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
