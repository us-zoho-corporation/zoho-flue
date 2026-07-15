import { useState } from 'react';
import { ZohoLogo } from './ZohoLogo.tsx';

/**
 * Login gate shown when no user is signed in. The button hands off to the Zoho
 * OAuth flow via `onSignIn` (which redirects to `/api/auth/login`), so it enters
 * a one-way "busy" state on click.
 * @param onSignIn - Called to kick off the Zoho sign-in redirect when the button is clicked.
 * @returns The rendered sign-in screen.
 */
export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  const [busy, setBusy] = useState(false);
  /**
   * Starts the sign-in flow by flipping the button into its busy state and
   * invoking `onSignIn`. No-ops if already busy, since the flow is one-way.
   */
  const go = () => {
    if (busy) return;
    setBusy(true);
    onSignIn();
  };

  return (
    <div className="login-screen">
      <div className="login-inner">
        <div className="login-head">
          <span style={{ color: 'var(--txt1)', display: 'flex' }}><ZohoLogo height={32} /></span>
          <div className="login-titles">
            <h1 className="login-title">Welcome to Zoho AI</h1>
            <p className="login-sub">Sign in with your Zoho account to continue.</p>
          </div>
        </div>

        <div className="login-card">
          <button className="login-btn" onClick={go} disabled={busy}>
            {busy && <span className="login-spinner" aria-hidden />}
            {busy ? 'Signing in…' : 'Continue with Zoho single sign-on'}
          </button>
          <p className="login-note">You'll be redirected to Zoho Accounts to sign in.</p>
        </div>
      </div>
    </div>
  );
}
