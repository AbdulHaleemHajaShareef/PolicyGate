const express = require('express');
const bcrypt = require('bcryptjs');

const { AuditLog, AccessGrant, Organization, Policy, Role, User } = require('../models');
const { requireAuth, requireAccess, loadEvaluationUser } = require('../middleware/auth');
const { evaluateAccess } = require('../services/policyEngine');

const router = express.Router();

router.use(requireAuth);

function toPlain(doc) {
  return doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

function buildRoleResponse(role) {
  const plain = toPlain(role);
  return {
    ...plain,
    policies: plain.policyIds || [],
  };
}

function buildUserResponse(user) {
  const plain = toPlain(user);
  return {
    ...plain,
    roleIds: plain.roleIds || [],
  };
}

router.get('/dashboard/overview', async (req, res, next) => {
  try {
    const [userCount, roleCount, policyCount, recentLogs] = await Promise.all([
      User.countDocuments({ orgId: req.auth.orgId }),
      Role.countDocuments({ orgId: req.auth.orgId }),
      Policy.countDocuments({ orgId: req.auth.orgId }),
      AuditLog.find({ orgId: req.auth.orgId }).sort({ timestamp: -1 }).limit(8).populate('userId', 'name email'),
    ]);

    res.json({
      counts: { users: userCount, roles: roleCount, policies: policyCount },
      recentLogs,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({ orgId: req.auth.orgId }).sort({ createdAt: -1 }).populate({
      path: 'roleIds',
      populate: { path: 'policyIds' },
    });

    res.json(users.map(buildUserResponse));
  } catch (error) {
    next(error);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, roleIds = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      orgId: req.auth.orgId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      roleIds,
    });

    res.status(201).json(user);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'User already exists' });
    }

    next(error);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const update = { ...req.body };
    if (update.password) {
      update.passwordHash = await bcrypt.hash(update.password, 10);
      delete update.password;
    }

    if (update.email) {
      update.email = update.email.trim().toLowerCase();
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, orgId: req.auth.orgId },
      update,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const removed = await User.findOneAndDelete({ _id: req.params.id, orgId: req.auth.orgId });
    if (!removed) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted' });
  } catch (error) {
    next(error);
  }
});

router.get('/roles', async (req, res, next) => {
  try {
    const roles = await Role.find({ orgId: req.auth.orgId }).sort({ createdAt: -1 }).populate('policyIds');
    res.json(roles.map(buildRoleResponse));
  } catch (error) {
    next(error);
  }
});

router.post('/roles', async (req, res, next) => {
  try {
    const { name, description = '', policyIds = [] } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const role = await Role.create({
      orgId: req.auth.orgId,
      name: name.trim(),
      description,
      policyIds,
    });

    res.status(201).json(role);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Role already exists' });
    }

    next(error);
  }
});

router.put('/roles/:id', async (req, res, next) => {
  try {
    const role = await Role.findOneAndUpdate(
      { _id: req.params.id, orgId: req.auth.orgId },
      req.body,
      { new: true }
    ).populate('policyIds');

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json(buildRoleResponse(role));
  } catch (error) {
    next(error);
  }
});

router.delete('/roles/:id', async (req, res, next) => {
  try {
    const removed = await Role.findOneAndDelete({ _id: req.params.id, orgId: req.auth.orgId });
    if (!removed) {
      return res.status(404).json({ message: 'Role not found' });
    }

    res.json({ message: 'Role deleted' });
  } catch (error) {
    next(error);
  }
});

router.get('/policies', async (req, res, next) => {
  try {
    const policies = await Policy.find({ orgId: req.auth.orgId }).sort({ createdAt: -1 });
    res.json(policies);
  } catch (error) {
    next(error);
  }
});

router.post('/policies', async (req, res, next) => {
  try {
    const { name, effect, actions = [], resources = [], conditions = {} } = req.body;
    if (!name || !effect) {
      return res.status(400).json({ message: 'name and effect are required' });
    }

    const policy = await Policy.create({
      orgId: req.auth.orgId,
      name: name.trim(),
      effect,
      actions,
      resources,
      conditions,
    });

    res.status(201).json(policy);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Policy already exists' });
    }

    next(error);
  }
});

router.put('/policies/:id', async (req, res, next) => {
  try {
    const policy = await Policy.findOneAndUpdate(
      { _id: req.params.id, orgId: req.auth.orgId },
      req.body,
      { new: true }
    );

    if (!policy) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.json(policy);
  } catch (error) {
    next(error);
  }
});

router.delete('/policies/:id', async (req, res, next) => {
  try {
    const removed = await Policy.findOneAndDelete({ _id: req.params.id, orgId: req.auth.orgId });
    if (!removed) {
      return res.status(404).json({ message: 'Policy not found' });
    }

    res.json({ message: 'Policy deleted' });
  } catch (error) {
    next(error);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { q = '', decision } = req.query;
    const filter = { orgId: req.auth.orgId };

    if (decision) {
      filter.decision = decision;
    }

    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [
        { action: regex },
        { resource: regex },
        { reason: regex },
        { policyName: regex },
      ];
    }

    const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(200).populate('userId', 'name email');
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

router.post('/simulate', async (req, res, next) => {
  try {
    const { userId, action, resource } = req.body;
    if (!userId || !action || !resource) {
      return res.status(400).json({ message: 'userId, action and resource are required' });
    }

    const user = await loadEvaluationUser(req.auth.orgId, userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const evaluation = evaluateAccess(user, action, resource, new Date());

    await AuditLog.create({
      orgId: req.auth.orgId,
      userId,
      action,
      resource,
      decision: evaluation.decision,
      reason: evaluation.reason,
      policyName: evaluation.matchedPolicy,
      timestamp: new Date(),
    });

    res.json({
      user: { _id: user._id, name: user.name, email: user.email },
      ...evaluation,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/grants', async (req, res, next) => {
  try {
    const grants = await AccessGrant.find({ orgId: req.auth.orgId }).sort({ createdAt: -1 }).populate('userId roleId');
    res.json(grants);
  } catch (error) {
    next(error);
  }
});

router.post('/grants', async (req, res, next) => {
  try {
    const { userId, roleId, expiresAt, note = '' } = req.body;
    if (!userId || !roleId || !expiresAt) {
      return res.status(400).json({ message: 'userId, roleId and expiresAt are required' });
    }

    const grant = await AccessGrant.create({
      orgId: req.auth.orgId,
      userId,
      roleId,
      expiresAt,
      note,
      createdByUserId: req.auth.userId,
    });

    res.status(201).json(grant);
  } catch (error) {
    next(error);
  }
});

router.delete('/grants/:id', async (req, res, next) => {
  try {
    const removed = await AccessGrant.findOneAndDelete({ _id: req.params.id, orgId: req.auth.orgId });
    if (!removed) {
      return res.status(404).json({ message: 'Grant not found' });
    }

    res.json({ message: 'Grant deleted' });
  } catch (error) {
    next(error);
  }
});

router.delete('/documents/:id', requireAccess('document:delete', (req) => `${req.auth.orgId}/documents/${req.params.id}`), async (req, res) => {
  res.json({ message: 'Document deleted', id: req.params.id, access: req.accessEvaluation });
});

module.exports = router;
