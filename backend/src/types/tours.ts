import type { z } from 'zod';
import type { tourBody, tourListQuery, tourByIdQuery } from '../validators';

export type CreateTourBody = z.infer<typeof tourBody>;
export type UpdateTourBody = CreateTourBody;

export interface TourParams {
    id: number;
}

export type GetFilteredToursQuery = z.infer<typeof tourListQuery>;

export interface GetTourByIdParams {
    id: number;
}

export type GetTourByIdQuery = z.infer<typeof tourByIdQuery>;
