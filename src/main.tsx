import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { AuthProvider, useAuth } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { TenantProvider, useTenant } from './lib/tenant';
import { ScopeProvider } from './lib/scope';
import { TeacherSubjectProvider } from './lib/teacherSubject';

/* Type helper for the global hider defined in index.html */
declare global { interface Window { __hideBoot?: () => void } }

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1
    }
  }
});

/**
 * Hides the inline boot loader in index.html as soon as the two things
 * we actually need are ready:
 *   1. Auth session rehydration finished
 *   2. Tenant list attempted (either resolved or errored)
 * Everything else lazy-loads.
 */
function BootReadyGate() {
  const { loading: authLoading } = useAuth();
  const { loading: tenantLoading } = useTenant();
  useEffect(() => {
    if (!authLoading && !tenantLoading) {
      // one frame delay so the first UI paint lands under the fade-out
      requestAnimationFrame(() => window.__hideBoot?.());
    }
  }, [authLoading, tenantLoading]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TenantProvider>
        <AuthProvider>
          <QueryClientProvider client={qc}>
            <ScopeProvider>
              <TeacherSubjectProvider>
                <BrowserRouter>
                  <BootReadyGate />
                  <App />
                </BrowserRouter>
              </TeacherSubjectProvider>
            </ScopeProvider>
          </QueryClientProvider>
        </AuthProvider>
      </TenantProvider>
    </ThemeProvider>
  </React.StrictMode>
);
