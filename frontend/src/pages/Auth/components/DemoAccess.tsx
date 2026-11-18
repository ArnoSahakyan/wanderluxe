import { ShieldCheckIcon, UserIcon } from '@heroicons/react/24/outline';
import { useDemoSignIn, useDemoStatus, useToast } from '../../../hooks';
import { formatAxiosError } from '../../../utils';

/**
 * "Try the demo" buttons, shown only when the API has DEMO_MODE on. After the
 * sign-in, UnprotectedRoute moves the visitor to their profile or the admin area.
 */
export const DemoAccess = () => {
  const { showError } = useToast();
  const { data: enabled } = useDemoStatus();
  const { mutate, isPending, variables } = useDemoSignIn();

  if (!enabled) return null;

  const start = (role: 'customer' | 'admin') =>
    mutate(role, {
      onError: (error: Error) =>
        showError(formatAxiosError(error) || 'The demo is not available right now.'),
    });

  const button =
    'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-primary-light px-3 py-2 text-sm font-semibold text-primary-light transition-colors hover:bg-primary-light/10 disabled:opacity-60 dark:border-primary-dark dark:text-primary-dark dark:hover:bg-primary-dark/10';

  return (
    <section
      aria-labelledby='demo-heading'
      className='mt-8 border-t border-gray-200 pt-6 dark:border-gray-700'
    >
      <h2
        id='demo-heading'
        className='text-center text-sm font-semibold text-text-light dark:text-text-dark'
      >
        Just looking around?
      </h2>
      <p className='mt-1 text-center text-xs text-secondary-light dark:text-secondary-dark'>
        Explore with a demo account. No sign-up needed.
      </p>
      <div className='mt-4 flex gap-3'>
        <button
          type='button'
          className={button}
          disabled={isPending}
          onClick={() => start('customer')}
        >
          <UserIcon className='size-4' aria-hidden='true' />
          {isPending && variables === 'customer' ? 'Opening…' : 'Try as customer'}
        </button>
        <button
          type='button'
          className={button}
          disabled={isPending}
          onClick={() => start('admin')}
        >
          <ShieldCheckIcon className='size-4' aria-hidden='true' />
          {isPending && variables === 'admin' ? 'Opening…' : 'Try as admin'}
        </button>
      </div>
    </section>
  );
};
