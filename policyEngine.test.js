const { evaluateAccess } = require('../src/services/policyEngine');

describe('policy evaluation engine', () => {
  test('explicit deny wins over allow', () => {
    const user = {
      roles: [
        {
          policies: [
            { name: 'allow-edit', effect: 'allow', actions: ['document:delete'], resources: ['org-1/documents/*'], conditions: {} },
            { name: 'deny-delete', effect: 'deny', actions: ['document:delete'], resources: ['org-1/documents/*'], conditions: {} },
          ],
        },
      ],
    };

    const result = evaluateAccess(user, 'document:delete', 'org-1/documents/doc-1', new Date('2026-07-13T10:00:00Z'));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('deny-delete');
  });

  test('wildcard matching allows broader policy matches', () => {
    const user = {
      roles: [
        {
          policies: [
            { name: 'allow-docs', effect: 'allow', actions: ['document:*'], resources: ['org-1/documents/*'], conditions: {} },
          ],
        },
      ],
    };

    const result = evaluateAccess(user, 'document:read', 'org-1/documents/doc-9', new Date('2026-07-13T10:00:00Z'));
    expect(result.decision).toBe('allow');
    expect(result.reason).toContain('allow-docs');
  });

  test('implicit deny applies when nothing matches', () => {
    const user = {
      roles: [
        {
          policies: [
            { name: 'billing-view', effect: 'allow', actions: ['billing:read'], resources: ['org-1/billing/*'], conditions: {} },
          ],
        },
      ],
    };

    const result = evaluateAccess(user, 'document:read', 'org-1/documents/doc-1', new Date('2026-07-13T10:00:00Z'));
    expect(result.decision).toBe('deny');
    expect(result.reason).toContain('implicit deny');
  });

  test('conditions can reject expired access', () => {
    const user = {
      roles: [
        {
          policies: [
            {
              name: 'temp-access',
              effect: 'allow',
              actions: ['document:read'],
              resources: ['org-1/documents/*'],
              conditions: { expiresAt: '2026-07-13T09:00:00Z' },
            },
          ],
        },
      ],
    };

    const result = evaluateAccess(user, 'document:read', 'org-1/documents/doc-1', new Date('2026-07-13T10:00:00Z'));
    expect(result.decision).toBe('deny');
    expect(result.trail[0].conditionPassed).toBe(false);
  });
});
