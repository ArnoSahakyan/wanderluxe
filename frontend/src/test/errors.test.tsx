import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RouteErrorPage from '../pages/Error/RouteErrorPage';
import { AppErrorBoundary } from '../pages/Error/AppErrorBoundary';
import { isChunkLoadError } from '../pages/Error/errors';

const Boom = ({ error }: { error: Error }): never => {
  throw error;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('error handling', () => {
  it('a page that crashes shows the error screen instead of a blank page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createMemoryRouter([
      {
        errorElement: <RouteErrorPage />,
        children: [{ path: '/', element: <Boom error={new Error('kaboom')} /> }],
      },
    ]);
    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/');
  });

  it('an unknown URL inside the tree shows the 404 page', async () => {
    const router = createMemoryRouter(
      [{ errorElement: <RouteErrorPage />, children: [{ path: '/', element: <p>home</p> }] }],
      { initialEntries: ['/nope'] },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('recognises a stale chunk after a deploy', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js')),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('kaboom'))).toBe(false);
  });

  it('AppErrorBoundary catches errors outside the router', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom error={new Error('provider failed')} />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
