export interface ISearchResponse {
  tours: {
    id: number;
    name: string;
    description: string;
    image: string;
    image_card?: string | null;
    type: string;
  }[];
  destinations: {
    id: number;
    name: string;
    description: string;
    image: string;
    image_card?: string | null;
    type: string;
  }[];
  posts: {
    id: number;
    name: string;
    excerpt: string;
    image: string;
    image_card?: string | null;
    type: string;
    slug: string;
  }[];
}

export interface ISearchFilters {
  query: string;
  limit?: number;
}
