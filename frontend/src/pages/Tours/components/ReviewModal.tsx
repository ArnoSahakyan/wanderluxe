import { FC, useState } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useReview } from '../../../hooks';
import { EmptyState, ErrorState, LoadingState, Pagination, ReviewCard } from '../../../components';
import { REVIEWS_LIMIT } from '../../../shared';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ReviewModalProps {
  tourId: number;
  isOpen: boolean;
  onClose: () => void;
  totalReviews: number;
}

export const ReviewModal: FC<ReviewModalProps> = ({ tourId, isOpen, onClose, totalReviews }) => {
  // Local state: paging the modal must not change the page behind it (?page in the URL).
  const [page, setPage] = useState(1);
  const goToNextPage = (totalPages: number) => setPage((p) => Math.min(p + 1, totalPages));
  const goToPrevPage = () => setPage((p) => Math.max(p - 1, 1));
  const {
    data: reviewsData,
    isLoading,
    isError,
    error,
  } = useReview(tourId, {
    limit: REVIEWS_LIMIT,
    page,
  });

  return (
    <Dialog open={isOpen} onClose={onClose} className='relative z-50'>
      <div className='fixed inset-0 bg-black/30 dark:bg-black/50' aria-hidden='true' />

      <div className='fixed inset-0 flex items-center justify-center p-4'>
        <DialogPanel className='w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-background-dark rounded-xl shadow-xl p-6'>
          <div className='flex justify-between items-center mb-6 pb-4 z-10'>
            <DialogTitle className='text-2xl font-bold text-primary-light dark:text-primary-dark'>
              All Reviews ({totalReviews})
            </DialogTitle>

            <button
              type='button'
              onClick={onClose}
              aria-label='Close reviews'
              className='rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            >
              <XMarkIcon className='size-6' aria-hidden='true' />
            </button>
          </div>

          <div className='grid grid-cols-1 gap-6'>
            {isLoading ? (
              <LoadingState message='Loading reviews...' />
            ) : isError ? (
              <ErrorState description={error && (error as Error).message} />
            ) : reviewsData?.reviews?.length === 0 ? (
              <EmptyState title='No reviews available' description="We couldn't find any reviews" />
            ) : (
              reviewsData?.reviews.map((review) => (
                <ReviewCard key={review.review_id} review={review} />
              ))
            )}
          </div>

          {reviewsData && reviewsData.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={reviewsData.totalPages}
              goToPrevPage={goToPrevPage}
              goToNextPage={goToNextPage}
            />
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
};
