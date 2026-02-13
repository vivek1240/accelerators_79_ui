import { useState } from 'react';
import * as api from '../api';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test((email || '').trim());
}

function getAuthError(e) {
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || e?.message || 'Something went wrong';
}

export default function Auth({ onAuthenticated }) {
  const [view, setView] = useState('signup'); // 'signup' | 'login'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const handleSignup = async (e) => {
    e.preventDefault();
    setApiError(null);
    const err = {};
    if (!name.trim()) err.name = 'Name is required';
    if (!email.trim()) err.email = 'Email is required';
    else if (!isValidEmail(email)) err.email = 'Please enter a valid email';
    if (!password) err.password = 'Password is required';
    else if (password.length < 6) err.password = 'Password must be at least 6 characters';
    setErrors(err);
    if (Object.keys(err).length > 0) return;
    setLoading(true);
    try {
      const data = await api.signup({ name: name.trim(), email: email.trim(), password });
      onAuthenticated?.(data);
    } catch (e) {
      setApiError(getAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setApiError(null);
    const err = {};
    if (!email.trim()) err.email = 'Email is required';
    else if (!isValidEmail(email)) err.email = 'Please enter a valid email';
    if (!password) err.password = 'Password is required';
    setErrors(err);
    if (Object.keys(err).length > 0) return;
    setLoading(true);
    try {
      const data = await api.login({ email: email.trim(), password });
      onAuthenticated?.(data);
    } catch (e) {
      setApiError(getAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const clearErrors = () => {
    setErrors({});
    setApiError(null);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{view === 'signup' ? 'Create account' : 'Log in'}</h1>
        <p className="auth-subtitle">
          {view === 'signup'
            ? 'Enter your details to get started.'
            : 'Welcome back. Enter your credentials.'}
        </p>
        {apiError && (
          <p className="auth-error auth-error-global" role="alert">
            {apiError}
          </p>
        )}

        {view === 'signup' ? (
          <form className="auth-form" onSubmit={handleSignup} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) clearErrors();
                }}
                className={errors.name ? 'auth-input-error' : ''}
              />
              {errors.name && <span className="auth-error">{errors.name}</span>}
            </div>
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) clearErrors();
                }}
                className={errors.email ? 'auth-input-error' : ''}
              />
              {errors.email && <span className="auth-error">{errors.email}</span>}
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) clearErrors();
                }}
                className={errors.password ? 'auth-input-error' : ''}
              />
              {errors.password && <span className="auth-error">{errors.password}</span>}
            </div>
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Signing up…' : 'Sign up'}
            </button>
            <p className="auth-switch">
              Already registered?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setView('login');
                  clearErrors();
                }}
              >
                Log in
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <div className="auth-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) clearErrors();
                }}
                className={errors.email ? 'auth-input-error' : ''}
              />
              {errors.email && <span className="auth-error">{errors.email}</span>}
            </div>
            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) clearErrors();
                }}
                className={errors.password ? 'auth-input-error' : ''}
              />
              {errors.password && <span className="auth-error">{errors.password}</span>}
            </div>
            <button type="submit" className="btn-primary auth-submit" disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </button>
            <p className="auth-switch">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="auth-link"
                onClick={() => {
                  setView('signup');
                  clearErrors();
                }}
              >
                Sign up
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
