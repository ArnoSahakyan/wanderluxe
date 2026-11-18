export interface ISingleBlog {
  post_id: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  is_published: boolean;
  image: string;
  /** Card-size copy (800px) for lists; may be missing for old images until it is generated. */
  image_card?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IBlog = Omit<ISingleBlog, 'content'>;

export interface IBlogResponse {
  posts: IBlog[];
  currentPage: number;
  totalPages: number;
  total: number;
}
