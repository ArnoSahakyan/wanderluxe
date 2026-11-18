export interface IReview {
  full_name: string;
  tour_name: string;
  comment: string;
  rating: number;
  review_id: number;
  tour_id: number;
  user_id: number;
  /** Sequelize timestamps are serialised in camelCase. */
  createdAt: string;
  updatedAt: string;
}

export interface IReviewResponse {
  reviews: IReview[];
  currentPage: number;
  totalPages: number;
  total: number;
}
