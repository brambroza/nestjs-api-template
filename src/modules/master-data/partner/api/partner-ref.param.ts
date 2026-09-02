import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';

import { PartnerType, type PartnerRef } from '../domain';

/**
 * Sub-resource controllers register each handler under two paths
 * (`customers/:partnerId/...` and `vendors/:partnerId/...`). Express
 * exposes the matched pattern on `req.route.path`; the segment before
 * `/:partnerId` tells us which partner type the client addressed.
 */
export function partnerRefFromRoute(
  routePath: string,
  partnerId: string,
): PartnerRef {
  if (/(^|\/)customers\/:partnerId(\/|$)/.test(routePath)) {
    return { type: PartnerType.Customer, id: partnerId };
  }
  if (/(^|\/)vendors\/:partnerId(\/|$)/.test(routePath)) {
    return { type: PartnerType.Vendor, id: partnerId };
  }
  throw new Error(`partnerRefFromRoute: unrecognised route "${routePath}"`);
}

export const PartnerRefParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PartnerRef => {
    const req = ctx.switchToHttp().getRequest<{
      route?: { path?: string };
      params?: Record<string, string | undefined>;
    }>();
    const routePath = req.route?.path;
    const partnerId = req.params?.['partnerId'];
    if (typeof routePath !== 'string' || typeof partnerId !== 'string') {
      throw new BadRequestException('partner reference missing from route');
    }
    return partnerRefFromRoute(routePath, partnerId);
  },
);

/** Route pairs shared by every partner sub-resource controller. */
// Plain string[] (not `as const`) because Nest's route decorators take a
// mutable `string | string[]`.
const both = (suffix: string): string[] => [
  `customers/:partnerId/${suffix}`,
  `vendors/:partnerId/${suffix}`,
];

export const PARTNER_ROUTES: Readonly<
  Record<
    | 'contacts'
    | 'addresses'
    | 'consents'
    | 'requests'
    | 'requestFulfil'
    | 'requestReject',
    string[]
  >
> = {
  contacts: both('contacts'),
  addresses: both('addresses'),
  consents: both('pdpa/consents'),
  requests: both('pdpa/requests'),
  requestFulfil: both('pdpa/requests/:requestId/fulfil'),
  requestReject: both('pdpa/requests/:requestId/reject'),
};
