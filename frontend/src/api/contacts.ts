import { api } from './axios';

/** Admin inbox for contact-form submissions (the public form lives in contact.ts). */
export type ContactStatus = 'unread' | 'read' | 'replied';

export interface ContactMessage {
  contact_id: number;
  full_name: string;
  email: string;
  phone_number: string;
  message: string;
  status: ContactStatus;
  createdAt?: string;
  created_at?: string;
}

export interface ContactMessagesResponse {
  total: number;
  page: number;
  totalPages: number;
  messages: ContactMessage[];
}

export const fetchContactMessages = async (
  page = 1,
  limit = 10,
): Promise<ContactMessagesResponse> => {
  const response = await api.get(`/contact?page=${page}&limit=${limit}`);
  return response.data;
};

export const updateContactMessageStatus = async (contact_id: number, status: ContactStatus) => {
  const response = await api.put<ContactMessage>(`/contact/${contact_id}/status`, { status });
  return response.data;
};

export const deleteContactMessage = async (contact_id: number): Promise<void> => {
  await api.delete(`/contact/${contact_id}`);
};
