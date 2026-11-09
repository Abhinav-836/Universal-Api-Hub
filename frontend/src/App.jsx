import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/ui/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import ApiSelection from './pages/ApiSelection';
import { Privacy, Terms } from './pages/Legal';
import { AppLoadingSkeleton } from './components/ui/Skeleton';

// Shown while a saved session is checked. A skeleton of the page the user
// is about to land on, instead of a lone spinner.
function Loading() {
  const { pathname } = useLocation();
  return <AppLoadingSkeleton page={pathname.startsWith('/apis') ? 'apis' : 'dashboard'} />;
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return !user ? children : <Navigate to="/dashboard" replace />;
}

function AppShell() {
  const { user } = useAuth();

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path="/" element={<PublicRoute><Home /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/apis" element={<PrivateRoute><ApiSelection /></PrivateRoute>} />
        {/* Public for everyone, signed in or not: Google's consent screen links here. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}