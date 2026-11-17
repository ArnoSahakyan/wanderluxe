/** Shared pagination maths. `page`/`limit` arrive already validated (see validators/common.ts). */
export const getPagination = (query: { page?: number; limit?: number }, defaultLimit = 10) => {
    const page = query.page ?? 1;
    const limit = query.limit ?? defaultLimit;
    return { page, limit, offset: (page - 1) * limit };
};

export const totalPages = (count: number, limit: number) => Math.ceil(count / limit);
