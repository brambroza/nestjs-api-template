import { InvalidItemFieldError, Item, TrackingPolicy } from './item';

describe('Item aggregate', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const baseProps = {
    id: 'i-1',
    tenantId: 't-1',
    sku: 'FIN-A',
    name: 'Finished Product A',
    defaultUomCode: 'PCS',
    now,
  };

  it('creates with defaults', () => {
    const i = Item.create(baseProps);
    const s = i.snapshot();
    expect(s.sku).toBe('FIN-A');
    expect(s.name).toBe('Finished Product A');
    expect(s.defaultUomCode).toBe('PCS');
    expect(s.description).toBeNull();
    expect(s.categoryId).toBeNull();
    expect(s.trackingPolicy).toBe(TrackingPolicy.None);
    expect(s.shelfLifeDays).toBeNull();
    expect(s.isActive).toBe(true);
  });

  it('rejects sku with space', () => {
    expect(() => Item.create({ ...baseProps, sku: 'FIN A' })).toThrow(
      InvalidItemFieldError,
    );
  });

  it('rejects empty defaultUomCode', () => {
    expect(() => Item.create({ ...baseProps, defaultUomCode: '   ' })).toThrow(
      InvalidItemFieldError,
    );
  });

  it('normalizes empty description to null', () => {
    const i = Item.create({ ...baseProps, description: '   ' });
    expect(i.snapshot().description).toBeNull();
  });

  it('LOT items may carry a shelf life; others may not', () => {
    const lot = Item.create({
      ...baseProps,
      trackingPolicy: TrackingPolicy.Lot,
      shelfLifeDays: 180,
    });
    expect(lot.snapshot().shelfLifeDays).toBe(180);
    expect(() =>
      Item.create({
        ...baseProps,
        trackingPolicy: TrackingPolicy.Serial,
        shelfLifeDays: 10,
      }),
    ).toThrow(InvalidItemFieldError);
    expect(() => Item.create({ ...baseProps, shelfLifeDays: 10 })).toThrow(
      InvalidItemFieldError,
    );
    expect(() =>
      Item.create({
        ...baseProps,
        trackingPolicy: TrackingPolicy.Lot,
        shelfLifeDays: 0,
      }),
    ).toThrow(InvalidItemFieldError);
  });
});
