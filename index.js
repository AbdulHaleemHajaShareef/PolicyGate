const mongoose = require('mongoose');

const { Schema, model } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

const policySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    effect: { type: String, enum: ['allow', 'deny'], required: true },
    actions: { type: [String], default: [] },
    resources: { type: [String], default: [] },
    conditions: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

policySchema.index({ orgId: 1, name: 1 }, { unique: true });

const roleSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    policyIds: [{ type: Schema.Types.ObjectId, ref: 'Policy' }],
  },
  { timestamps: true }
);

roleSchema.index({ orgId: 1, name: 1 }, { unique: true });

const userSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role' }],
  },
  { timestamps: true }
);

userSchema.index({ orgId: 1, email: 1 }, { unique: true });

const auditLogSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    decision: { type: String, enum: ['allow', 'deny'], required: true },
    reason: { type: String, required: true },
    policyName: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ orgId: 1, timestamp: -1 });

const accessGrantSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

accessGrantSchema.index({ orgId: 1, userId: 1, expiresAt: 1 });

const Organization = model('Organization', organizationSchema);
const Policy = model('Policy', policySchema);
const Role = model('Role', roleSchema);
const User = model('User', userSchema);
const AuditLog = model('AuditLog', auditLogSchema);
const AccessGrant = model('AccessGrant', accessGrantSchema);

module.exports = {
  Organization,
  Policy,
  Role,
  User,
  AuditLog,
  AccessGrant,
};
