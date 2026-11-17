import { useSearchParams } from 'react-router-dom';
import { IFetchFilters } from '../shared';

/** Positive integer from a URL param, or the fallback for missing/invalid values (e.g. ?page=abc). */
export const parsePositiveInt = (value: string | null | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

export const useMergedFilters = (externalFilters?: Partial<IFetchFilters>, defaultLimit = 10) => {
  const [searchParams] = useSearchParams();

  return {
    page: externalFilters?.page ?? parsePositiveInt(searchParams.get('page'), 1),
    limit: externalFilters?.limit ?? parsePositiveInt(searchParams.get('limit'), defaultLimit),
    sort: externalFilters?.sort ?? searchParams.get('sort') ?? undefined,
    search: externalFilters?.search ?? searchParams.get('search') ?? undefined,
  };
};
