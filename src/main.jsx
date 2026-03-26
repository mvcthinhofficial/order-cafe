import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { HashRouter as Router } from 'react-router-dom'

import React from 'react';

// GLOBAL BROWSER INTENT INTERCEPTOR
// Many mobile QR scanners (especially Zalo on Android) or Safari (from cache/history) 
// will open a scanned URL but aggressively restore the hash fragment from the last active session 
// (e.g., `#/admin`). This bypasses standard routing. 
// We intercept `?action=` here BEFORE React Router initializes to force the intended route.
(() => {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const action = searchParams.get('action');
    if (action) {
      if (action === 'attendance') {
        const staffId = searchParams.get('staffId');
        const token = searchParams.get('token');
        if (staffId && token) window.location.hash = `#/attendance?staffId=${staffId}&token=${token}`;
      } else if (action === 'order') {
        const token = searchParams.get('token');
        const itemId = searchParams.get('itemId');
        let orderParams = new URLSearchParams();
        if (token) orderParams.append('token', token);
        if (itemId) orderParams.append('itemId', itemId);
        window.location.hash = `#/order?${orderParams.toString()}`;
      } else if (action === 'item') {
        const itemId = searchParams.get('itemId');
        if (itemId) window.location.hash = `#/item/${itemId}`;
      } else if (action === 'admin') {
        window.location.hash = `#/admin`;
      } else if (action === 'kiosk') {
        window.location.hash = `#/kiosk`;
      }
    } else {
       // Legacy QR code fallback (if old printed QR codes are scanned)
       const legacyToken = searchParams.get('token');
       if (legacyToken && !window.location.hash.includes('#/attendance') && !window.location.hash.includes('#/admin')) {
          window.location.hash = `#/order?token=${legacyToken}`;
       }
    }
  } catch (e) { console.error("URL Interceptor Error:", e); }
})();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: 'red', color: 'white' }}>
          <h1>React Crashed!</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.toString()}</pre>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Router>
        <App />
      </Router>
    </ErrorBoundary>
  </StrictMode>,
)
