import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './features/auth/LoginPage';
import { RoleLoginGate } from './features/auth/RoleLoginGate';
import { RegisterPage } from './features/registration/RegisterPage';
import { CashierPage } from './features/cashier/CashierPage';
import { PhotographerPage } from './features/photographer/PhotographerPage';
import { AdminPage } from './features/admin/AdminPage';
import { MakeupPage } from './features/workflow/MakeupPage';
import { ChooserPage } from './features/workflow/ChooserPage';
import { useHashNavigation } from './hooks/useHashNavigation';
import { useRealtimeQueueCount } from './hooks/useRealtimeQueueCount';

export default function App() {
  const { currentTab, selectTab, routeByStaffRole } = useHashNavigation();
  const queueCount = useRealtimeQueueCount();
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="group/app-shell min-h-dvh flex flex-col font-sans text-ink">
        <Navbar currentTab={currentTab} onSelectTab={selectTab} queueCount={queueCount} />

        <main className="flex-1">
          {/* Public Participant Portal */}
          {currentTab === 'register' && <ParticipantPortal />}

          {/* Unified Staff Login Portal */}
          {currentTab === 'login' && <LoginPage onLoginSuccess={routeByStaffRole} />}

          {/* Cashier Role Protected Route */}
          {currentTab === 'cashier' && (
            <RoleLoginGate allowedRoles={['cashier', 'admin']} targetStationName="the Cashier">
              <CashierPage />
            </RoleLoginGate>
          )}

          {/* Photographer Role Protected Route */}
          {currentTab === 'photographer' && (
            <RoleLoginGate allowedRoles={['photographer', 'admin']} targetStationName="the Photo Set">
              <PhotographerPage />
            </RoleLoginGate>
          )}

          {currentTab === 'mua' && (
            <RoleLoginGate allowedRoles={['mua']} targetStationName="Makeup / Grooming">
              <MakeupPage />
            </RoleLoginGate>
          )}

          {currentTab === 'chooser' && (
            <RoleLoginGate allowedRoles={['chooser']} targetStationName="Chooser">
              <ChooserPage />
            </RoleLoginGate>
          )}

          {/* Studio Admin Protected Route */}
          {currentTab === 'admin' && (
            <RoleLoginGate allowedRoles={['admin']} targetStationName="Admin">
              <AdminPage />
            </RoleLoginGate>
          )}
        </main>

        <footer className="theme-night no-print group-has-[[data-student-overall]]/app-shell:hidden bg-obsidian text-neutral-400 py-6 mt-12 text-xs relative">
          <div aria-hidden="true" className="gold-rule absolute inset-x-0 top-0" />
          <div className="w-full max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left font-mono">
            <div>
              <strong className="font-display font-semibold text-foil uppercase tracking-[0.18em]">Hi-Light Studio</strong> •
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

function ParticipantPortal() {
  const { user } = useAuth();
  if (user?.role === 'mua' || user?.role === 'chooser') {
    return <RoleLoginGate allowedRoles={['cashier', 'photographer', 'admin']} targetStationName="Registration"><RegisterPage /></RoleLoginGate>;
  }
  return <RegisterPage />;
}
