import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { TenantProvider } from './lib/tenant';
import { ScopeProvider } from './lib/scope';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,   // auto-refresh when user comes back
      refetchOnReconnect: true,
      retry: 1
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TenantProvider>
        <AuthProvider>
          <QueryClientProvider client={qc}>
            <ScopeProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </ScopeProvider>
          </QueryClientProvider>
        </AuthProvider>
      </TenantProvider>
    </ThemeProvider>
  </React.StrictMode>
);
