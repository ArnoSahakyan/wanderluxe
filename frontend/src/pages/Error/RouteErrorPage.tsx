import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import NotFoundPage from '../NotFound/NotFoundPage';
import { ErrorScreen } from './ErrorScreen';
import { isChunkLoadError, reloadOnceForNewVersion } from './errors';

/** errorElement for the whole route tree: a render or loading error anywhere lands here. */
const RouteErrorPage = () => {
  const error = useRouteError();
  const newVersion = isChunkLoadError(error);

  useEffect(() => {
    if (newVersion && reloadOnceForNewVersion()) return;
    console.error('Unhandled error while rendering the page', error);
  }, [error, newVersion]);

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  return newVersion ? (
    <ErrorScreen
      title='WanderLuxe has been updated'
      description='A newer version of the site is available. Reload the page to continue.'
    />
  ) : (
    <ErrorScreen
      title='Something went wrong'
      description='This page ran into an unexpected problem. Reloading usually fixes it; if not, please try again later.'
    />
  );
};

export default RouteErrorPage;
