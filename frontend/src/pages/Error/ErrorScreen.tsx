import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ErrorScreenProps {
  title: string;
  description: string;
}

/**
 * Full-page fallback for crashes. Uses plain links (not the router), so it also
 * works when the error happened outside the router.
 */
export const ErrorScreen = ({ title, description }: ErrorScreenProps) => (
  <main
    role='alert'
    className='grid min-h-screen place-items-center bg-background-light px-6 py-24 dark:bg-background-dark'
  >
    <div className='max-w-lg text-center'>
      <ExclamationTriangleIcon
        className='mx-auto size-14 text-accent-light dark:text-accent-dark'
        aria-hidden='true'
      />
      <h1 className='mt-4 text-3xl font-semibold tracking-tight text-primary-light dark:text-text-dark'>
        {title}
      </h1>
      <p className='mt-4 text-secondary-light dark:text-secondary-dark'>{description}</p>
      <div className='mt-8 flex items-center justify-center gap-x-6'>
        <button type='button' className='form-button' onClick={() => window.location.reload()}>
          Reload the page
        </button>
        <a
          href='/'
          className='text-sm font-semibold text-primary-light hover:text-primary-light/80 dark:text-primary-dark dark:hover:text-primary-dark/80'
        >
          Go to the home page
        </a>
      </div>
    </div>
  </main>
);
