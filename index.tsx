import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { UserProvider } from './context/UserContext';
import { WebAuthProvider } from './context/WebAuthContext';
import { ToastProvider } from './context/ToastContext';
import { KeyboardProvider } from './context/KeyboardContext';
import { LanguageProvider } from './context/LanguageContext';

function AppWithUser() {
  return (
    <UserProvider>
      <ToastProvider>
        <KeyboardProvider>
          <App />
        </KeyboardProvider>
        </ToastProvider>
    </UserProvider>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <WebAuthProvider>
        <AppWithUser />
      </WebAuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
