import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConfirmNewsletter } from '../../hooks';

const ConfirmNewsletter = () => {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { mutate: confirm, isPending, isSuccess, isError } = useConfirmNewsletter();

  // Confirm exactly once per token (StrictMode mounts effects twice in development).
  const confirmedToken = useRef<string | null>(null);
  useEffect(() => {
    if (token && confirmedToken.current !== token) {
      confirmedToken.current = token;
      confirm(token);
    }
  }, [token, confirm]);

  return (
    <div className='max-w-lg mx-auto px-4 py-20 text-center text-secondary-light dark:text-secondary-dark'>
      <h1 className='text-2xl font-semibold mb-4 text-primary-light dark:text-primary-dark'>
        {isSuccess ? 'You are subscribed!' : 'Confirming your subscription...'}
      </h1>
      <div role='status' aria-live='polite'>
        {!token && (
          <p className='text-red-600 dark:text-red-400'>
            This confirmation link is missing its token.
          </p>
        )}
        {isPending && <p>Verifying your email. Please wait...</p>}
        {isSuccess && (
          <p className='text-green-700 dark:text-green-400 mt-4'>
            Subscription confirmed. Thank you!
          </p>
        )}
        {isError && (
          <p className='text-red-600 dark:text-red-400 mt-4'>
            Confirmation failed. The link might be invalid or expired.
          </p>
        )}
      </div>
    </div>
  );
};

export default ConfirmNewsletter;
