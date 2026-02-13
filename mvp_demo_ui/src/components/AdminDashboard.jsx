/**
 * Admin dashboard: list all users, Allow / Deny access (is_allowed).
 * Only visible to users with role === 'admin'.
 */
import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';

export default function AdminDashboard({ onError }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listUsers();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = api.getErrorMessage?.(e, 'Failed to load users') ?? 'Failed to load users';
      if (typeof onError === 'function') onError(msg);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSetAccess = async (userId, isAllowed) => {
    setUpdating(userId);
    try {
      await api.setUserAccess(userId, isAllowed);
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, is_allowed: isAllowed } : u))
      );
    } catch (e) {
      const msg = api.getErrorMessage?.(e, 'Failed to update access') ?? 'Failed to update access';
      if (typeof onError === 'function') onError(msg);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <p className="admin-loading">Loading users…</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h2 className="admin-title">User access</h2>
      <p className="admin-subtitle">Allow or deny access for signed-up users.</p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Access</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-empty">
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? '—'}</td>
                  <td>
                    <span className={`admin-role admin-role-${u.role}`}>{u.role}</span>
                  </td>
                  <td>{u.is_allowed ? 'Allowed' : 'Denied'}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="admin-no-action">—</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="admin-btn admin-btn-allow"
                          disabled={updating === u.user_id || u.is_allowed}
                          onClick={() => handleSetAccess(u.user_id, true)}
                        >
                          {updating === u.user_id ? '…' : 'Allow access'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn-deny"
                          disabled={updating === u.user_id || !u.is_allowed}
                          onClick={() => handleSetAccess(u.user_id, false)}
                        >
                          {updating === u.user_id ? '…' : 'Deny access'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
