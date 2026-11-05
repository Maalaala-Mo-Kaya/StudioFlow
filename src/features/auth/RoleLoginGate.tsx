import React from 'react';
import { useAuth } from '../../context/AuthContext';
import type { StaffRole } from '../../types';
import { LoginPage } from './LoginPage';

interface RoleLoginGateProps {
  allowedRoles: StaffRole[];
  targetStationName?: string;
  children: React.ReactNode;
}

export const RoleLoginGate: React.FC<RoleLoginGateProps> = ({
  allowedRoles,
  targetStationName,
  children,
}) => {
  const { user, hasRole } = useAuth();

  if (user && hasRole(allowedRoles)) {
    return <>{children}</>;
  }

  return <LoginPage requiredRoles={allowedRoles} targetStationName={targetStationName} />;
};
