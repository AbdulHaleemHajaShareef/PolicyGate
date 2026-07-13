const jwt = require('jsonwebtoken');

const { AuditLog, AccessGrant, Role, User } = require('../models');
const { evaluateAccess } = require('../services/policyEngine');

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  return process.env.JWT_SECRET;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing authentication token' });
  }

  try {
    req.auth = jwt.verify(token, getJwtSecret());
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function toRoleDocument(role) {
  if (!role) {
    return null;
  }

  const plainRole = typeof role.toObject === 'function' ? role.toObject() : role;
  return {
    ...plainRole,
    policies: plainRole.policyIds || plainRole.policies || [],
  };
}

async function loadEvaluationUser(orgId, userId) {
  const user = await User.findOne({ _id: userId, orgId }).populate({
    path: 'roleIds',
    populate: { path: 'policyIds' },
  });

  if (!user) {
    return null;
  }

  const activeGrants = await AccessGrant.find({
    orgId,
    userId,
    expiresAt: { $gt: new Date() },
  }).populate({
    path: 'roleId',
    populate: { path: 'policyIds' },
  });

  const rolesById = new Map();

  for (const role of user.roleIds || []) {
    const normalized = toRoleDocument(role);
    if (normalized && normalized._id) {
      rolesById.set(normalized._id.toString(), normalized);
    }
  }

  for (const grant of activeGrants) {
    const normalized = toRoleDocument(grant.roleId);
    if (normalized && normalized._id) {
      rolesById.set(normalized._id.toString(), normalized);
    }
  }

  return {
    ...user.toObject(),
    roles: Array.from(rolesById.values()),
  };
}

function requireAccess(action, resolveResource) {
  return async function accessGate(req, res, next) {
    try {
      const resource = typeof resolveResource === 'function'
        ? resolveResource(req)
        : req.body.resource || req.originalUrl;

      const evaluationUser = await loadEvaluationUser(req.auth.orgId, req.auth.userId);

      if (!evaluationUser) {
        return res.status(404).json({ message: 'User not found in this organization' });
      }

      const evaluation = evaluateAccess(evaluationUser, action, resource, new Date());

      await AuditLog.create({
        orgId: req.auth.orgId,
        userId: req.auth.userId,
        action,
        resource,
        decision: evaluation.decision,
        reason: evaluation.reason,
        policyName: evaluation.matchedPolicy,
        timestamp: new Date(),
      });

      req.accessEvaluation = evaluation;
      req.accessResource = resource;

      if (evaluation.decision === 'deny') {
        return res.status(403).json(evaluation);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireAuth,
  requireAccess,
  loadEvaluationUser,
};
