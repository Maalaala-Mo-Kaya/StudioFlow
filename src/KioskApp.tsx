import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { StudioFooter } from './components/StudioFooter';
import { RegisterPage } from './features/registration/RegisterPage';

const stayOnForm = () => {};

/**
 * The client-port build (`vite --mode kiosk`): only the public registration form. Served on
 * port 8090 by scripts/client-gateway.cjs, which forwards only the kiosk's own calls; staff
 * stations live on the staff port and are not in this bundle.
 */
export default function KioskApp() {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="group/app-shell min-h-dvh flex flex-col font-sans text-ink">
          <Navbar currentTab="register" onSelectTab={stayOnForm} />
          <main className="flex-1">
            <RegisterPage />
          </main>
          <StudioFooter />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}
