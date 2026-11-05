import { useState, useEffect, useCallback } from 'react';
import { ROLE_DEFAULT_ROUTE, VALID_APP_ROUTES } from '../constants/studio';
import type { StaffRole } from '../types';

export function useHashNavigation(defaultTab = 'register') {
  const [currentTab, setCurrentTab] = useState<string>(defaultTab);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if ((VALID_APP_ROUTES as readonly string[]).includes(hash)) {
        setCurrentTab(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectTab = useCallback((tab: string) => {
    setCurrentTab(tab);
    window.location.hash = `#/${tab}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const routeByStaffRole = useCallback(
    (role: StaffRole) => {
      selectTab(ROLE_DEFAULT_ROUTE[role] || 'register');
    },
    [selectTab]
  );

  return {
    currentTab,
    selectTab,
    routeByStaffRole,
  };
}
