export interface IDestination {
  destination_id: string;
  description: string;
  name: string;
  image: string;
  /** Card-size copy (800px) for lists; may be missing for old images until it is generated. */
  image_card?: string | null;
  tourCount: number;
  startingPrice?: number;
}

export type ISingleDestination = Omit<IDestination, 'tourCount, startingPrice'>;

export interface IDestinationResponse {
  destinations: IDestination[];
  currentPage: number;
  totalPages: number;
  total: number;
}

export interface DestinationPayload {
  name: string;
  description: string;
  images: File[];
}
