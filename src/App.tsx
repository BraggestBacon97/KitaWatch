import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Home from '@/pages/Home';
import Browse from '@/pages/Browse';
import Detail from '@/pages/Detail';
import Watch from '@/pages/Watch';
import MyList from '@/pages/MyList';
import Settings from '@/pages/Settings';
import { TermsPage, PrivacyPage, DmcaPage } from '@/pages/Legal';
import { completeLogin, isLoginPending } from '@/services/authFlow';

export default function App() {
  const location = useLocation();

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];

    // 1) Official helper: wraps the deep-link://new-url event
    import('@tauri-apps/plugin-deep-link')
      .then(async (m) => {
        if (disposed) return;
        const current = await m.getCurrent();
        current?.forEach(completeLogin);
        const un = await m.onOpenUrl((urls) => urls.forEach(completeLogin));
        cleanups.push(un);
      })
      .catch(() => {});

    // 2) Raw event listener (covers helper quirks across plugin versions)
    import('@tauri-apps/api/event')
      .then(async () => {
        if (disposed) return;
        const un = await listen<string[]>('deep-link://new-url', (e) =>
          e.payload?.forEach(completeLogin),
        );
        cleanups.push(un);
      })
      .catch(() => {});

    // 3) Poll while a login is pending — on Windows/Linux the URL can also
    //    arrive via CLI args, which getCurrent() surfaces.
    const poll = setInterval(() => {
      if (!isLoginPending() || disposed) return;
      import('@tauri-apps/plugin-deep-link')
        .then((m) => m.getCurrent())
        .then((urls) => urls?.forEach(completeLogin))
        .catch(() => {});
    }, 2000);
    cleanups.push(() => clearInterval(poll));

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-ink-950 text-zinc-200">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Home />} />
              <Route path="/browse" element={<Browse />} />
              <Route path="/anime/:id" element={<Detail />} />
              <Route path="/watch/:id/:episode" element={<Watch />} />
              <Route path="/my-list" element={<MyList />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/dmca" element={<DmcaPage />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </AnimatePresence>
        </ErrorBoundary>
      </div>
    </div>
  );
}
