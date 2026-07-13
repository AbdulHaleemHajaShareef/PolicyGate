const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { Organization, User } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  return process.env.JWT_SECRET;
}

function signToken(user, org) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      orgId: org._id.toString(),
      email: user.email,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
}

router.get('/orgs', async (_req, res, next) => {
  try {
    const orgs = await Organization.find().sort({ createdAt: 1 });
    res.json(orgs);
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { orgName, name, email, password } = req.body;

    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ message: 'orgName, name, email and password are required' });
    }

    const organization = await Organization.create({ name: orgName.trim() });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      orgId: organization._id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      roleIds: [],
    });

    const token = signToken(user, organization);
    res.status(201).json({
      token,
      org: organization,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Organization or user already exists' });
    }

    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { orgId, email, password } = req.body;

    if (!orgId || !email || !password) {
      return res.status(400).json({ message: 'orgId, email and password are required' });
    }

    const org = await Organization.findById(orgId);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const user = await User.findOne({ orgId, email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid login credentials' });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid login credentials' });
    }

    const token = signToken(user, org);
    res.json({
      token,
      org,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.auth.userId, orgId: req.auth.orgId }).populate('roleIds');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user,
      auth: req.auth,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
