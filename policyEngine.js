const { matchesPattern } = require('../utils/match');

function toMinutes(value) {
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function evaluateConditions(conditions = {}, now = new Date()) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return { allowed: true, reason: null };
  }

  if (conditions.expiresAt) {
    const expiresAt = new Date(conditions.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || now > expiresAt) {
      return { allowed: false, reason: 'condition failed: access grant expired' };
    }
  }

  if (conditions.timeWindow) {
    const { start, end } = conditions.timeWindow;
    if (start && end) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMinutes = toMinutes(start);
      const endMinutes = toMinutes(end);
      const withinWindow = startMinutes <= endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
        : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

      if (!withinWindow) {
        return { allowed: false, reason: `condition failed: outside allowed time window ${start}-${end}` };
      }
    }
  }

  return { allowed: true, reason: null };
}

function collectPolicies(user) {
  const policies = [];
  const roles = user?.roles || [];

  for (const role of roles) {
    const rolePolicies = role?.policies || [];
    policies.push(...rolePolicies);
  }

  return policies;
}

function buildTrailEntry(policy, matched, conditionResult) {
  return {
    policyId: policy._id?.toString?.() || policy.id || null,
    policyName: policy.name,
    effect: policy.effect,
    matched,
    conditionPassed: conditionResult.allowed,
    conditionReason: conditionResult.reason,
  };
}

function evaluateAccess(user, action, resource, now = new Date()) {
  const policies = collectPolicies(user);
  const trail = [];
  let allowPolicy = null;

  for (const policy of policies) {
    const actionMatches = Array.isArray(policy.actions) && policy.actions.some((pattern) => matchesPattern(pattern, action));
    const resourceMatches = Array.isArray(policy.resources) && policy.resources.some((pattern) => matchesPattern(pattern, resource));
    const matched = actionMatches && resourceMatches;

    if (!matched) {
      trail.push(buildTrailEntry(policy, false, { allowed: true, reason: null }));
      continue;
    }

    const conditionResult = evaluateConditions(policy.conditions, now);
    trail.push(buildTrailEntry(policy, true, conditionResult));

    if (!conditionResult.allowed) {
      continue;
    }

    if (policy.effect === 'deny') {
      return {
        decision: 'deny',
        reason: `denied: explicit deny policy '${policy.name}'`,
        trail,
        matchedPolicy: policy.name,
      };
    }

    if (!allowPolicy && policy.effect === 'allow') {
      allowPolicy = policy;
    }
  }

  if (allowPolicy) {
    return {
      decision: 'allow',
      reason: `allowed by policy '${allowPolicy.name}'`,
      trail,
      matchedPolicy: allowPolicy.name,
    };
  }

  return {
    decision: 'deny',
    reason: 'denied: no matching allow policy - implicit deny',
    trail,
    matchedPolicy: null,
  };
}

module.exports = {
  evaluateAccess,
  evaluateConditions,
  collectPolicies,
};
