import './styles/tokens.css';
import './ui/ui.css';
import './styles/glass.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { ensureDeviceId } from './api/device';
import { router } from './router';
import { initTheme } from './store/theme';
import { Toaster } from './ui';

ensureDeviceId();
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </React.StrictMode>,
);
