import { InvalidPermissionRuleError, parsePermissionsJson } from './permission';

describe('parsePermissionsJson', () => {
  it('parses a well-formed array', () => {
    const rules = parsePermissionsJson(
      '[{"action":"read","subject":"ProductionOrder"},{"action":"approve","subject":"ProductionOrderApprove"}]',
    );
    expect(rules).toEqual([
      { action: 'read', subject: 'ProductionOrder', inverted: undefined },
      {
        action: 'approve',
        subject: 'ProductionOrderApprove',
        inverted: undefined,
      },
    ]);
  });

  it('accepts inverted rules (deny)', () => {
    const rules = parsePermissionsJson(
      '[{"action":"delete","subject":"ProductionOrder","inverted":true}]',
    );
    expect(rules[0]?.inverted).toBe(true);
  });

  it('rejects non-array top level', () => {
    expect(() => parsePermissionsJson('{"action":"x"}')).toThrow(
      InvalidPermissionRuleError,
    );
  });

  it('rejects entries missing action or subject', () => {
    expect(() => parsePermissionsJson('[{"action":"read"}]')).toThrow(
      /subject/,
    );
    expect(() => parsePermissionsJson('[{"subject":"X"}]')).toThrow(/action/);
  });

  it('rejects malformed JSON', () => {
    expect(() => parsePermissionsJson('{not json')).toThrow(
      InvalidPermissionRuleError,
    );
  });
});
