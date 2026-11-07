import { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './features/auth/LoginPage';
import { RoleLoginGate } from './features/auth/RoleLoginGate';
import { RegisterPage } from './features/registration/RegisterPage';
import { CashierPage } from './features/cashier/CashierPage';
import { PhotographerPage } from './features/photographer/PhotographerPage';
import { AdminPage } from './features/admin/AdminPage';
import { pb } from './db/pocketbase';
import type { StaffRole } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('register');
  const [queueCount, setQueueCount] = useState<number>(0);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (['register', 'login', 'cashier', 'photographer', 'admin'].includes(hash)) {
        setCurrentTab(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectTab = (tab: string) => {
    setCurrentTab(tab);
    window.location.hash = `#/${tab}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = (role: StaffRole) => {
    if (role === 'admin') {
      handleSelectTab('admin');
    } else if (role === 'cashier') {
      handleSelectTab('cashier');
    } else {
      handleSelectTab('photographer');
    }
  };

  useEffect(() => {
    const updateCount = async () => {
      try {
        const records = await pb.collection('registrations').getList(1, 1, {
          filter: "status = 'paid' || status = 'shooting'",
          requestKey: null,
        });
        setQueueCount(records.totalItems);
      } catch (err) {
        if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) return;
        console.error('Failed to load queue count:', err);
      }
    };

    updateCount();
    pb.collection('registrations').subscribe('*', () => {
      updateCount();
    });

    return () => {
      pb.collection('registrations').unsubscribe('*');
    };
  }, []);

  return (
    <AuthProvider>
      <ToastProvider>
        <div className="group/app-shell min-h-dvh bg-[#F8F7F4] flex flex-col font-sans text-[#0A0A0A]">
        <Navbar currentTab={currentTab} onSelectTab={handleSelectTab} queueCount={queueCount} />

        <main className="flex-1">
          {/* Public Participant Portal */}
          {currentTab === 'register' && <RegisterPage />}

          {/* Unified Staff Login Portal */}
          {currentTab === 'login' && <LoginPage onLoginSuccess={handleLoginSuccess} />}

          {/* Cashier Role Protected Route */}
          {currentTab === 'cashier' && (
            <RoleLoginGate allowedRoles={['cashier', 'admin']}>
              <CashierPage />
            </RoleLoginGate>
          )}

          {/* Photographer Role Protected Route */}
          {currentTab === 'photographer' && (
            <RoleLoginGate allowedRoles={['photographer', 'admin']}>
              <PhotographerPage />
            </RoleLoginGate>
          )}

          {/* Studio Admin Protected Route */}
          {currentTab === 'admin' && (
            <RoleLoginGate allowedRoles={['admin']}>
              <AdminPage />
            </RoleLoginGate>
          )}
        </main>

        <footer className="no-print group-has-[[data-student-overall]]/app-shell:hidden bg-[#0A0A0A] text-neutral-400 border-t-2 border-[#C9A227] py-6 mt-12 text-xs">
          <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left font-mono">
            <div>
              <strong className="text-[#C9A227] uppercase tracking-wider">Hi-Light Studio</strong> •
              P. del Rosario St., Cebu City (opp. USC-Main) • Tel: 032-2540886
            </div>
            <div className="text-neutral-500">
              STUDIOFLOW V2 // OFFLINE LAN AUTOMATION
            </div>
          </div>
        </footer>
      </div>
    </ToastProvider>
  </AuthProvider>
  );
}
