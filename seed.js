require('dotenv').config();

const bcrypt = require('bcryptjs');

const { connectDb } = require('./config/db');
const { AccessGrant, AuditLog, Organization, Policy, Role, User } = require('./models');

async function seedOrg(seed) {
  const org = await Organization.create({ name: seed.name });

  const policies = await Policy.insertMany(seed.policies.map((policy) => ({
    orgId: org._id,
    ...policy,
  })));

  const policyByName = new Map(policies.map((policy) => [policy.name, policy]));

  const roles = await Role.insertMany(seed.roles.map((role) => ({
    orgId: org._id,
    name: role.name,
    description: role.description,
    policyIds: role.policyNames.map((policyName) => policyByName.get(policyName)._id),
  })));

  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await User.insertMany(seed.users.map((user) => ({
    orgId: org._id,
    name: user.name,
    email: user.email,
    passwordHash,
    roleIds: user.roleNames.map((roleName) => roleByName.get(roleName)._id),
  })));

  if (seed.grants && seed.grants.length > 0) {
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    await AccessGrant.insertMany(seed.grants.map((grant) => ({
      orgId: org._id,
      userId: userByEmail.get(grant.userEmail)._id,
      roleId: roleByName.get(grant.roleName)._id,
      expiresAt: grant.expiresAt,
      note: grant.note || '',
      createdByUserId: userByEmail.get(grant.createdByEmail || grant.userEmail)._id,
    })));
  }

  await AuditLog.insertMany(seed.auditLogs.map((log) => ({
    orgId: org._id,
    userId: users[0]._id,
    action: log.action,
    resource: log.resource,
    decision: log.decision,
    reason: log.reason,
    policyName: log.policyName || null,
    timestamp: log.timestamp,
  })));

  return org;
}

async function seed() {
  await connectDb(process.env.MONGO_URI);

  await Promise.all([
    AccessGrant.deleteMany({}),
    AuditLog.deleteMany({}),
    User.deleteMany({}),
    Role.deleteMany({}),
    Policy.deleteMany({}),
    Organization.deleteMany({}),
  ]);

  await seedOrg({
    name: 'Northwind Labs',
    policies: [
      {
        name: 'view-documents',
        effect: 'allow',
        actions: ['document:read'],
        resources: ['org-northwind/documents/*'],
        conditions: {},
      },
      {
        name: 'edit-documents',
        effect: 'allow',
        actions: ['document:read', 'document:update'],
        resources: ['org-northwind/documents/*'],
        conditions: { timeWindow: { start: '09:00', end: '18:00' } },
      },
      {
        name: 'no-delete-friday',
        effect: 'deny',
        actions: ['document:delete'],
        resources: ['org-northwind/documents/*'],
        conditions: {},
      },
    ],
    roles: [
      { name: 'Viewer', description: 'Can read documents', policyNames: ['view-documents'] },
      { name: 'Editor', description: 'Can read and update documents', policyNames: ['view-documents', 'edit-documents'] },
      { name: 'Admin', description: 'Can manage all resources', policyNames: ['view-documents', 'edit-documents', 'no-delete-friday'] },
    ],
    users: [
      { name: 'Nina Viewer', email: 'nina@northwind.com', roleNames: ['Viewer'] },
      { name: 'Eli Editor', email: 'eli@northwind.com', roleNames: ['Editor'] },
      { name: 'Ava Admin', email: 'ava@northwind.com', roleNames: ['Admin'] },
    ],
    auditLogs: [
      { action: 'document:read', resource: 'org-northwind/documents/doc-1', decision: 'allow', reason: 'seeded sample event', timestamp: new Date() },
      { action: 'document:delete', resource: 'org-northwind/documents/doc-2', decision: 'deny', reason: 'seeded sample event', timestamp: new Date() },
    ],
  });

  await seedOrg({
    name: 'Blue Cedar Finance',
    policies: [
      {
        name: 'billing-read',
        effect: 'allow',
        actions: ['billing:read'],
        resources: ['org-bluecedar/billing/*'],
        conditions: {},
      },
      {
        name: 'billing-deny-export',
        effect: 'deny',
        actions: ['billing:export'],
        resources: ['org-bluecedar/billing/*'],
        conditions: {},
      },
    ],
    roles: [
      { name: 'Billing Viewer', description: 'Can view billing data', policyNames: ['billing-read'] },
      { name: 'Billing Admin', description: 'Can manage billing data', policyNames: ['billing-read', 'billing-deny-export'] },
    ],
    users: [
      { name: 'Bea Billing', email: 'bea@bluecedar.com', roleNames: ['Billing Viewer'] },
      { name: 'Sam Finance', email: 'sam@bluecedar.com', roleNames: ['Billing Admin'] },
    ],
    grants: [
      {
        userEmail: 'bea@bluecedar.com',
        roleName: 'Billing Admin',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12),
        note: 'temporary escalation for support work',
      },
    ],
    auditLogs: [
      { action: 'billing:read', resource: 'org-bluecedar/billing/invoice-1', decision: 'allow', reason: 'seeded sample event', timestamp: new Date() },
    ],
  });

  console.log('Seed complete. Demo passwords are set to password123');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
