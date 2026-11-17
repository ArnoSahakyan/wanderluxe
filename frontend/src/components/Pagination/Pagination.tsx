import { FC } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PaginationProps {
  page: number;
  totalPages: number;
  goToPrevPage: () => void;
  goToNextPage: (totalPages: number) => void;
}

export const Pagination: FC<PaginationProps> = ({
  page,
  totalPages,
  goToPrevPage,
  goToNextPage,
}) => {
  return (
    <nav aria-label='Pagination' className='flex justify-center items-center gap-4 mt-10'>
      <button
        type='button'
        onClick={goToPrevPage}
        disabled={page <= 1}
        aria-label='Previous page'
        className='btn-icon-primary'
      >
        <ChevronLeftIcon className='w-5 h-5' aria-hidden='true' />
      </button>
      <span className='text-secondary-light dark:text-secondary-dark' aria-live='polite'>
        Page {page} of {totalPages}
      </span>
      <button
        type='button'
        onClick={() => goToNextPage(totalPages)}
        disabled={page >= totalPages}
        aria-label='Next page'
        className='btn-icon-primary'
      >
        <ChevronRightIcon className='w-5 h-5' aria-hidden='true' />
      </button>
    </nav>
  );
};
