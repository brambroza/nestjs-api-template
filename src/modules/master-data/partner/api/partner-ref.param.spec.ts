import { PartnerType } from '../domain';

import { partnerRefFromRoute } from './partner-ref.param';

describe('partnerRefFromRoute', () => {
  it('detects customers with and without a global prefix', () => {
    expect(partnerRefFromRoute('/customers/:partnerId/contacts', 'c1')).toEqual(
      {
        type: PartnerType.Customer,
        id: 'c1',
      },
    );
    expect(
      partnerRefFromRoute(
        '/api/v1/customers/:partnerId/pdpa/requests/:requestId/fulfil',
        'c2',
      ),
    ).toEqual({ type: PartnerType.Customer, id: 'c2' });
  });

  it('detects vendors', () => {
    expect(
      partnerRefFromRoute('/api/v1/vendors/:partnerId/addresses', 'v1'),
    ).toEqual({
      type: PartnerType.Vendor,
      id: 'v1',
    });
  });

  it('does not match a lookalike segment', () => {
    expect(() =>
      partnerRefFromRoute('/api/v1/items/:partnerId/contacts', 'x'),
    ).toThrow();
    expect(() => partnerRefFromRoute('/api/v1/customers/:id', 'x')).toThrow();
  });
});
