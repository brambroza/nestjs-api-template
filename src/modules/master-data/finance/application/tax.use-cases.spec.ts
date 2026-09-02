import {
  DefaultTaxCodeExistsError,
  InvalidTaxCodeFieldError,
  NoTaxCodeForKindError,
  PndForm,
  TaxKind,
  VatTreatment,
} from '../domain';

import {
  CreateTaxCodeUseCase,
  ResolveTaxUseCase,
  SetItemTaxOverrideUseCase,
} from './tax.use-cases';
import {
  FixedClock,
  FixedTenantContext,
  InMemoryTaxCodeRepository,
  StubFinanceRefLookup,
} from './testing/in-memory';

describe('tax use cases', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  let repo: InMemoryTaxCodeRepository;
  let create: CreateTaxCodeUseCase;
  let setOverride: SetItemTaxOverrideUseCase;
  let resolve: ResolveTaxUseCase;

  beforeEach(() => {
    repo = new InMemoryTaxCodeRepository();
    const tenant = new FixedTenantContext('t', 'u');
    const clock = new FixedClock(now);
    create = new CreateTaxCodeUseCase(repo, tenant, clock);
    setOverride = new SetItemTaxOverrideUseCase(
      repo,
      new StubFinanceRefLookup(['item-a'], []),
      tenant,
      clock,
    );
    resolve = new ResolveTaxUseCase(repo, tenant);
  });

  it('resolve: default VAT, item override to EXEMPT, computed amount', async () => {
    await expect(resolve.execute({ kind: TaxKind.Vat })).rejects.toThrow(
      NoTaxCodeForKindError,
    );

    const vat7 = await create.execute({
      code: 'VAT7',
      name: 'VAT 7%',
      kind: TaxKind.Vat,
      rateBasisPoints: 700n,
      isDefault: true,
    });
    const exempt = await create.execute({
      code: 'VAT-EX',
      name: 'Exempt',
      kind: TaxKind.Vat,
      rateBasisPoints: 0n,
      vatTreatment: VatTreatment.Exempt,
    });

    const d = await resolve.execute({
      kind: TaxKind.Vat,
      itemId: 'item-a',
      baseAmountMinor: 100_000n,
    });
    expect(d).toMatchObject({ source: 'DEFAULT', taxMinor: 7_000n });
    expect(d.taxCode.snapshot().id).toBe(vat7.snapshot().id);

    await setOverride.execute({
      itemId: 'item-a',
      kind: TaxKind.Vat,
      taxCodeId: exempt.snapshot().id,
      reason: 'medical',
    });
    const o = await resolve.execute({
      kind: TaxKind.Vat,
      itemId: 'item-a',
      baseAmountMinor: 100_000n,
    });
    expect(o).toMatchObject({ source: 'ITEM_OVERRIDE', taxMinor: 0n });
    expect(o.taxCode.snapshot().vatTreatment).toBe('EXEMPT');

    // another item still gets the default
    expect(
      (await resolve.execute({ kind: TaxKind.Vat, itemId: 'item-b' })).source,
    ).toBe('DEFAULT');
  });

  it('only one default per kind; override kind must match', async () => {
    await create.execute({
      code: 'WHT3',
      name: 'Services',
      kind: TaxKind.Wht,
      rateBasisPoints: 300n,
      pndForm: PndForm.Pnd53,
      isDefault: true,
    });
    await expect(
      create.execute({
        code: 'WHT5',
        name: 'Rent',
        kind: TaxKind.Wht,
        rateBasisPoints: 500n,
        pndForm: PndForm.Pnd53,
        isDefault: true,
      }),
    ).rejects.toThrow(DefaultTaxCodeExistsError);
    const wht3 = await repo.findByCode('t', 'WHT3');
    await expect(
      setOverride.execute({
        itemId: 'item-a',
        kind: TaxKind.Vat,
        taxCodeId: wht3?.snapshot().id ?? '',
      }),
    ).rejects.toThrow(InvalidTaxCodeFieldError);
    await expect(
      setOverride.execute({
        itemId: 'nope',
        kind: TaxKind.Wht,
        taxCodeId: wht3?.snapshot().id ?? '',
      }),
    ).rejects.toThrow(InvalidTaxCodeFieldError);
  });
});
