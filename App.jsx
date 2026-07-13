import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';

const tabs = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'manager', label: 'Roles & Policies' },
  { id: 'simulator', label: 'Access Checker' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'grants', label: 'Temporary Access' },
];

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function emptyForm(values) {
  return values.reduce((acc, key) => {
    acc[key] = '';
    return acc;
  }, {});
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('policygate-auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [orgs, setOrgs] = useState([]);
  const [authMode, setAuthMode] = useState('login');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [grants, setGrants] = useState([]);
  const [simulatorResult, setSimulatorResult] = useState(null);
  const [userForm, setUserForm] = useState(emptyForm(['name', 'email', 'password']));
  const [roleForm, setRoleForm] = useState(emptyForm(['name', 'description']));
  const [policyForm, setPolicyForm] = useState({ name: '', effect: 'allow', actions: '', resources: '', conditions: '' });
  const [grantForm, setGrantForm] = useState({ userId: '', roleId: '', expiresAt: '', note: '' });
  const [simulatorForm, setSimulatorForm] = useState({ userId: '', action: 'document:read', resource: '' });
  const [loginForm, setLoginForm] = useState({ orgId: '', email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ orgName: '', name: '', email: '', password: '' });

  const token = auth?.token || '';

  const currentOrgLabel = useMemo(() => {
    if (!auth) return 'No organization selected';
    return auth.org?.name || auth.orgName || 'Signed in';
  }, [auth]);

  useEffect(() => {
    apiRequest('/auth/orgs')
      .then((data) => {
        setOrgs(data);
        setLoginForm((current) => ({ ...current, orgId: data[0]?._id || '' }));
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem('policygate-auth', JSON.stringify(auth));
    Promise.all([
      apiRequest('/dashboard/overview', { token }),
      apiRequest('/users', { token }),
      apiRequest('/roles', { token }),
      apiRequest('/policies', { token }),
      apiRequest('/audit-logs', { token }),
      apiRequest('/grants', { token }),
    ])
      .then(([dashboardData, usersData, rolesData, policiesData, logsData, grantsData]) => {
        setDashboard(dashboardData);
        setUsers(usersData);
        setRoles(rolesData);
        setPolicies(policiesData);
        setAuditLogs(logsData);
        setGrants(grantsData);
        setSimulatorForm((current) => ({
          ...current,
          userId: usersData[0]?._id || '',
          resource: usersData[0]?.orgId ? `${usersData[0].orgId}/documents/doc-1` : current.resource,
        }));
        setGrantForm((current) => ({
          ...current,
          userId: usersData[0]?._id || '',
          roleId: rolesData[0]?._id || '',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 16),
        }));
      })
      .catch((error) => setMessage(error.message));
  }, [auth, token]);

  function refreshData() {
    if (!auth) return;
    setLoading(true);
    Promise.all([
      apiRequest('/dashboard/overview', { token }),
      apiRequest('/users', { token }),
      apiRequest('/roles', { token }),
      apiRequest('/policies', { token }),
      apiRequest('/audit-logs', { token }),
      apiRequest('/grants', { token }),
    ])
      .then(([dashboardData, usersData, rolesData, policiesData, logsData, grantsData]) => {
        setDashboard(dashboardData);
        setUsers(usersData);
        setRoles(rolesData);
        setPolicies(policiesData);
        setAuditLogs(logsData);
        setGrants(grantsData);
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setMessage('');
    const data = await apiRequest('/auth/login', { method: 'POST', body: loginForm });
    setAuth(data);
  }

  async function handleRegister(event) {
    event.preventDefault();
    setMessage('');
    const data = await apiRequest('/auth/register', { method: 'POST', body: registerForm });
    setAuth(data);
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    await apiRequest('/users', { token, method: 'POST', body: { ...userForm, roleIds: [] } });
    setUserForm(emptyForm(['name', 'email', 'password']));
    refreshData();
  }

  async function handleCreateRole(event) {
    event.preventDefault();
    await apiRequest('/roles', { token, method: 'POST', body: { ...roleForm, policyIds: [] } });
    setRoleForm(emptyForm(['name', 'description']));
    refreshData();
  }

  async function handleCreatePolicy(event) {
    event.preventDefault();
    await apiRequest('/policies', {
      token,
      method: 'POST',
      body: {
        name: policyForm.name,
        effect: policyForm.effect,
        actions: policyForm.actions.split(',').map((item) => item.trim()).filter(Boolean),
        resources: policyForm.resources.split(',').map((item) => item.trim()).filter(Boolean),
        conditions: policyForm.conditions ? JSON.parse(policyForm.conditions) : {},
      },
    });
    setPolicyForm({ name: '', effect: 'allow', actions: '', resources: '', conditions: '' });
    refreshData();
  }

  async function handleSimulate(event) {
    event.preventDefault();
    const result = await apiRequest('/simulate', { token, method: 'POST', body: simulatorForm });
    setSimulatorResult(result);
    refreshData();
  }

  async function handleCreateGrant(event) {
    event.preventDefault();
    await apiRequest('/grants', { token, method: 'POST', body: grantForm });
    setGrantForm((current) => ({ ...current, note: '' }));
    refreshData();
  }

  function handleLogout() {
    localStorage.removeItem('policygate-auth');
    setAuth(null);
    setDashboard(null);
    setUsers([]);
    setRoles([]);
    setPolicies([]);
    setAuditLogs([]);
    setGrants([]);
    setSimulatorResult(null);
  }

  if (!auth) {
    return (
      <div className="auth-shell">
        <div className="auth-card hero-card">
          <div className="eyebrow">PolicyGate IAM</div>
          <h1>A small student project for org-based access control.</h1>
          <p>
            Sign in to see a basic flow for users, roles, policies, audit logs, and access checks.
          </p>
          <div className="pill-row">
            <span>Org-scoped</span>
            <span>JWT login</span>
            <span>Deny wins</span>
          </div>
        </div>

        <div className="auth-card form-card">
          <div className="tab-row compact">
            <button className={authMode === 'login' ? 'tab active' : 'tab'} onClick={() => setAuthMode('login')}>Login</button>
            <button className={authMode === 'register' ? 'tab active' : 'tab'} onClick={() => setAuthMode('register')}>Register</button>
          </div>

          {message ? <div className="notice">{message}</div> : null}

          {authMode === 'login' ? (
            <form className="stack" onSubmit={handleLogin}>
              <label>
                Organization
                <select value={loginForm.orgId} onChange={(event) => setLoginForm({ ...loginForm, orgId: event.target.value })}>
                  {orgs.map((org) => <option key={org._id} value={org._id}>{org.name}</option>)}
                </select>
              </label>
              <label>
                Email
                <input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} />
              </label>
              <label>
                Password
                <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
              </label>
              <button type="submit">Sign in</button>
            </form>
          ) : (
            <form className="stack" onSubmit={handleRegister}>
              <label>
                Organization name
                <input value={registerForm.orgName} onChange={(event) => setRegisterForm({ ...registerForm, orgName: event.target.value })} />
              </label>
              <label>
                Your name
                <input value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} />
              </label>
              <label>
                Email
                <input value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} />
              </label>
              <label>
                Password
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} />
              </label>
              <button type="submit">Create org</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">PolicyGate IAM</div>
          <h2>{currentOrgLabel}</h2>
          <p>Seed data is already loaded. Demo password: password123.</p>
        </div>
        <div className="topbar-actions">
          <button className="ghost" onClick={refreshData} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
          <button className="ghost" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <nav className="tab-row">
        {tabs.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? 'tab active' : 'tab'} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      {message ? <div className="notice">{message}</div> : null}

      {activeTab === 'dashboard' && dashboard ? (
        <section className="grid dashboard-grid">
          <article className="panel metric-panel">
            <h3>Users</h3>
            <strong>{dashboard.counts.users}</strong>
          </article>
          <article className="panel metric-panel">
            <h3>Roles</h3>
            <strong>{dashboard.counts.roles}</strong>
          </article>
          <article className="panel metric-panel">
            <h3>Policies</h3>
            <strong>{dashboard.counts.policies}</strong>
          </article>
          <article className="panel wide-panel">
            <h3>Recent checks</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Decision</th>
                    <th>Reason</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recentLogs.map((log) => (
                    <tr key={log._id}>
                      <td>{log.action}</td>
                      <td>{log.resource}</td>
                      <td>{log.decision}</td>
                      <td>{log.reason}</td>
                      <td>{formatDateTime(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === 'manager' ? (
        <section className="stack">
          <div className="grid two-col">
            <form className="panel stack" onSubmit={handleCreateUser}>
              <h3>Add user</h3>
              <input placeholder="Name" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} />
              <input placeholder="Email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} />
              <input placeholder="Password" type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} />
              <button type="submit">Save user</button>
            </form>

            <form className="panel stack" onSubmit={handleCreateRole}>
              <h3>Add role</h3>
              <input placeholder="Name" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} />
              <input placeholder="Description" value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} />
              <button type="submit">Save role</button>
            </form>
          </div>

          <div className="grid two-col">
            <form className="panel stack" onSubmit={handleCreatePolicy}>
              <h3>Add rule</h3>
              <input placeholder="Name" value={policyForm.name} onChange={(event) => setPolicyForm({ ...policyForm, name: event.target.value })} />
              <select value={policyForm.effect} onChange={(event) => setPolicyForm({ ...policyForm, effect: event.target.value })}>
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </select>
              <input placeholder="Actions, comma separated" value={policyForm.actions} onChange={(event) => setPolicyForm({ ...policyForm, actions: event.target.value })} />
              <input placeholder="Resources, comma separated" value={policyForm.resources} onChange={(event) => setPolicyForm({ ...policyForm, resources: event.target.value })} />
              <textarea placeholder='Conditions JSON, e.g. {"timeWindow":{"start":"09:00","end":"18:00"}}' value={policyForm.conditions} onChange={(event) => setPolicyForm({ ...policyForm, conditions: event.target.value })} />
              <button type="submit">Save policy</button>
            </form>

            <div className="panel stack">
              <h3>Saved roles and rules</h3>
              {roles.map((role) => (
                <div key={role._id} className="list-card">
                  <strong>{role.name}</strong>
                  <span>{role.description}</span>
                  <small>{(role.policies || []).map((policy) => policy.name).join(', ') || 'No policies attached'}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="panel stack">
            <h3>People</h3>
            {users.map((user) => (
              <div key={user._id} className="list-card">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
                <small>{(user.roleIds || []).map((role) => role.name).join(', ') || 'No roles assigned'}</small>
              </div>
            ))}
          </div>

          <div className="panel stack">
            <h3>Rules</h3>
            {policies.map((policy) => (
              <div key={policy._id} className="list-card">
                <strong>{policy.name}</strong>
                <span>{policy.effect}</span>
                <small>{policy.actions.join(', ')} | {policy.resources.join(', ')}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === 'simulator' ? (
        <section className="grid two-col">
          <form className="panel stack" onSubmit={handleSimulate}>
            <h3>Access checker</h3>
            <select value={simulatorForm.userId} onChange={(event) => setSimulatorForm({ ...simulatorForm, userId: event.target.value })}>
              {users.map((user) => <option key={user._id} value={user._id}>{user.name}</option>)}
            </select>
            <input value={simulatorForm.action} onChange={(event) => setSimulatorForm({ ...simulatorForm, action: event.target.value })} placeholder="Action, e.g. document:delete" />
            <input value={simulatorForm.resource} onChange={(event) => setSimulatorForm({ ...simulatorForm, resource: event.target.value })} placeholder="Resource, e.g. org-id/documents/doc-1" />
            <button type="submit">Evaluate access</button>
          </form>

          <div className="panel stack simulator-panel">
            <h3>Why it decided that</h3>
            {simulatorResult ? (
              <>
                <div className={`decision ${simulatorResult.decision}`}>
                  {simulatorResult.decision.toUpperCase()}
                </div>
                <p>{simulatorResult.reason}</p>
                <div className="trail-list">
                  {simulatorResult.trail.map((step, index) => (
                    <div key={`${step.policyName || 'step'}-${index}`} className="trail-item">
                      <strong>{step.policyName}</strong>
                      <span>{step.matched ? 'matched' : 'did not match'}</span>
                      <small>{step.conditionReason || 'conditions were okay'}</small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Select a user and run a check to see the result and the reason behind it.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'audit' ? (
        <section className="panel stack">
          <h3>Check history</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Decision</th>
                  <th>Reason</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log._id}>
                    <td>{log.userId?.name || 'System'}</td>
                    <td>{log.action}</td>
                    <td>{log.resource}</td>
                    <td>{log.decision}</td>
                    <td>{log.reason}</td>
                    <td>{formatDateTime(log.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'grants' ? (
        <section className="grid two-col">
          <form className="panel stack" onSubmit={handleCreateGrant}>
            <h3>Short-term access</h3>
            <select value={grantForm.userId} onChange={(event) => setGrantForm({ ...grantForm, userId: event.target.value })}>
              {users.map((user) => <option key={user._id} value={user._id}>{user.name}</option>)}
            </select>
            <select value={grantForm.roleId} onChange={(event) => setGrantForm({ ...grantForm, roleId: event.target.value })}>
              {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
            </select>
            <input type="datetime-local" value={grantForm.expiresAt} onChange={(event) => setGrantForm({ ...grantForm, expiresAt: event.target.value })} />
            <input placeholder="Note" value={grantForm.note} onChange={(event) => setGrantForm({ ...grantForm, note: event.target.value })} />
            <button type="submit">Grant role temporarily</button>
          </form>

          <div className="panel stack">
            <h3>Active grants</h3>
            {grants.map((grant) => (
              <div key={grant._id} className="list-card">
                <strong>{grant.userId?.name || 'User'}</strong>
                <span>{grant.roleId?.name || 'Role'}</span>
                <small>Expires {formatDateTime(grant.expiresAt)}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
