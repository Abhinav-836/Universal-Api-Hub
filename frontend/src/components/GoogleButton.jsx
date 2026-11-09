// frontend/src/components/GoogleButton.jsx
//
// Google's own "Sign in with Google" button (Google Identity Services).
// Google shows the account picker and hands back an ID token (a signed JWT);
// onCredential posts it to the backend, which checks it. The client ID comes
// from the backend (/auth/config), so only the backend needs GOOGLE_CLIENT_ID.
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;
let configPromise = null;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google sign-in'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/** The backend's Google client ID, or null when Google sign-in is off. Asked once per page load. */
export function getGoogleClientId() {
  if (!configPromise) {
    configPromise = api
      .get('/auth/config')
      .then((r) => r.data?.googleClientId || null)
      .catch(() => {
        configPromise = null;
        return null;
      });
  }
  return configPromise;
}

export default function GoogleButton({ text = 'continue_with', onCredential, disabled }) {
  const box = useRef(null);
  const handler = useRef(onCredential);
  const [clientId, setClientId] = useState(null);
  const [failed, setFailed] = useState(false);
  handler.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    getGoogleClientId().then((id) => !cancelled && setClientId(id));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current) return;
        const g = window.google.accounts.id;
        g.initialize({
          client_id: clientId,
          callback: (resp) => resp?.credential && handler.current?.(resp.credential),
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        box.current.innerHTML = '';
        g.renderButton(box.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text, // signin_with | signup_with | continue_with
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.max(200, Math.min(400, Math.round(box.current.offsetWidth || 380))),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (!clientId) return null;
  return (
    <div className="mb-6">
      {failed ? (
        <p className="text-center text-xs text-slate-500">Google sign-in couldn't load. Use your email below.</p>
      ) : (
        <div className={disabled ? 'pointer-events-none opacity-60' : undefined}>
          <div ref={box} className="flex w-full justify-center min-h-[44px]" />
        </div>
      )}
      <p className="mt-3 text-center text-xs text-slate-500">
        By continuing you agree to the{' '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-slate-300">Terms</Link> and{' '}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-slate-300">Privacy policy</Link>.
      </p>
      <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500" aria-hidden="true">
        <span className="h-px flex-1 bg-white/10" />
        or with email
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
