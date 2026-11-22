import { useState, useEffect, useCallback } from 'react';
import { ROLE_DEFAULT_ROUTE, VALID_APP_ROUTES } from '../constants/studio';
import type { StaffRole } from '../types';

export function useHashNavigation(defaultTab = 'register') {
  const [currentTab, setCurrentTab] = useState(() => resolveHash(defaultTab));

  useEffect(() => {
    const handleHashChange = () => {
      const tab = resolveHash(defaultTab);
      if (window.location.hash && window.location.hash !== `#/${tab}`) {
        window.history.replaceState(window.history.state, '', `#/${tab}`);
      }
      setCurrentTab(tab);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [defaultTab]);

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

function resolveHash(defaultTab: string) {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return (VALID_APP_ROUTES as readonly string[]).includes(hash) ? hash : defaultTab;
}
