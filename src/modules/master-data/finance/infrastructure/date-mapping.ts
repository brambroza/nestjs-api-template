import { fromIsoDate, toIsoDate, type IsoDate } from '../domain';

/** Prisma `@db.Date` <-> domain IsoDate. Dates are UTC-midnight instants in the client. */
export const dateToDb = (iso: IsoDate): Date => fromIsoDate(iso);
export const dateFromDb = (d: Date): IsoDate => toIsoDate(d);
