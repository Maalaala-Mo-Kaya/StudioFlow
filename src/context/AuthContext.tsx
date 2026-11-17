import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { pb } from '../db/pocketbase';
import type { StaffUser, StaffRole } from '../types';

interface AuthContextValue {
  user: StaffUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<StaffUser>;
  logout: () => void;
  hasRole: (allowedRoles: StaffRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthRecordLike {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  role?: string;
  verified?: boolean;
  disabled?: boolean;
  created?: string;
}

const mapRecordToStaffUser = (record: AuthRecordLike | null | undefined): StaffUser | null => {
  if (!record || !record.id || record.disabled) return null;
  return {
    id: record.id,
    username: record.username || record.email || 'staff',
    email: record.email,
    name: record.name || record.username || 'Studio Staff',
    role: (record.role as StaffRole) || 'cashier',
    verified: record.verified,
    created: record.created,
  };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffUser | null>(() =>
    pb.authStore.isValid ? mapRecordToStaffUser(pb.authStore.record) : null
  );

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      if (pb.authStore.isValid && record) {
        setUser(mapRecordToStaffUser(record));
      } else {
        setUser(null);
      }
    }, true);

    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<StaffUser> => {
    const authData = await pb
      .collection('users')
      .authWithPassword(username.trim(), password);
    const staffUser = mapRecordToStaffUser(authData.record);
    if (!staffUser) {
      throw new Error('Invalid staff account record.');
    }
    setUser(staffUser);
    return staffUser;
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const id = pb.authStore.record?.id;
      if (!pb.authStore.isValid || !id) return;
      const token = pb.authStore.token;
      try {
        const current = await pb.collection('users').getOne(id);
        if (pb.authStore.token === token) pb.authStore.save(token, current);
      } catch (error) {
        if (pb.authStore.token === token && error && typeof error === 'object' &&
          'status' in error && [401, 403, 404].includes(Number(error.status))) pb.authStore.clear();
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (allowedRoles: StaffRole[]) => {
      if (!user) return false;
      // Admin role has full super-access across all modules
      if (user.role === 'admin') return true;
      return allowedRoles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
