import { ALLOWED_TRANSITIONS, canTransition } from './state-machine';
import { ProductionOrderStatus } from './production-order-status';

/**
 * R1 exhaustive check. Walks every ordered pair (from, to) in the status
 * space and asserts that `canTransition` matches exactly the transitions
 * declared in ALLOWED_TRANSITIONS.
 *
 * If someone adds a transition without listing it, or adds one that the
 * documentation forgot, this test fails. The transition table and the
 * hand-maintained docs/state-machine.md are the two sources of truth;
 * this spec catches drift between them and the code.
 */
describe('production-order state machine (R1)', () => {
  const allStatuses = Object.values(ProductionOrderStatus);

  const declaredKey = (
    from: ProductionOrderStatus,
    to: ProductionOrderStatus,
  ): string => `${from}->${to}`;

  const declaredSet = new Set(
    ALLOWED_TRANSITIONS.map((t) => declaredKey(t.from, t.to)),
  );

  it.each(allStatuses)('does not allow identity transition from %s', (s) => {
    expect(canTransition(s, s)).toBe(false);
  });

  it('enumerates 10 allowed transitions and 39 forbidden pairs across the 49-cell grid', () => {
    let allowed = 0;
    let forbidden = 0;
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        if (from === to) continue;
        if (canTransition(from, to)) {
          allowed++;
        } else {
          forbidden++;
        }
      }
    }
    expect(allowed).toBe(ALLOWED_TRANSITIONS.length);
    expect(allowed + forbidden).toBe(
      allStatuses.length * (allStatuses.length - 1),
    );
  });

  it('canTransition returns true exactly for the entries listed in ALLOWED_TRANSITIONS', () => {
    for (const from of allStatuses) {
      for (const to of allStatuses) {
        const expected = declaredSet.has(declaredKey(from, to));
        expect(canTransition(from, to)).toBe(expected);
      }
    }
  });

  it('does not permit CANCELLED as a source of any transition', () => {
    for (const to of allStatuses) {
      expect(canTransition(ProductionOrderStatus.CANCELLED, to)).toBe(false);
    }
  });

  it('does not permit COMPLETED as a source of any transition', () => {
    for (const to of allStatuses) {
      expect(canTransition(ProductionOrderStatus.COMPLETED, to)).toBe(false);
    }
  });

  it('does not permit IN_PROGRESS -> CANCELLED (progress cannot be cancelled)', () => {
    expect(
      canTransition(
        ProductionOrderStatus.IN_PROGRESS,
        ProductionOrderStatus.CANCELLED,
      ),
    ).toBe(false);
  });

  it('allows CANCELLED entry from DRAFT, SUBMITTED, APPROVED, RELEASED only', () => {
    const cancellable = allStatuses.filter((s) =>
      canTransition(s, ProductionOrderStatus.CANCELLED),
    );
    expect(new Set(cancellable)).toEqual(
      new Set([
        ProductionOrderStatus.DRAFT,
        ProductionOrderStatus.SUBMITTED,
        ProductionOrderStatus.APPROVED,
        ProductionOrderStatus.RELEASED,
      ]),
    );
  });
});
