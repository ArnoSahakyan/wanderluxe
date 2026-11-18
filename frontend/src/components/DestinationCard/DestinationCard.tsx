import { SmartImage } from '../SmartImage/SmartImage';
import { Link } from 'react-router-dom';
import { IDestination, ROUTES } from '../../shared';
import { FC } from 'react';
import { MapPinIcon } from '@heroicons/react/24/outline';

interface DestinationCardProps extends IDestination {
  mode?: 'public' | 'admin';
  /** h2 when the card sits directly under the page's h1. */
  headingLevel?: 'h2' | 'h3';
  /** Above the fold: load the image eagerly and early. */
  priority?: boolean;
}

export const DestinationCard: FC<DestinationCardProps> = ({
  destination_id,
  name,
  image,
  image_card,
  tourCount,
  description,
  startingPrice,
  mode = 'public',
  headingLevel: Heading = 'h3',
  priority = false,
}) => {
  const isAdmin = mode === 'admin';

  return (
    <div className='relative group overflow-hidden rounded-xl bg-background-light dark:bg-background-dark shadow-md border border-gray-200 dark:border-gray-700 transition-all hover:shadow-lg'>
      {/* Image with overlay */}
      <div className='relative h-60 overflow-hidden'>
        <SmartImage
          src={image_card || image || undefined}
          fallbackSrc={image}
          alt={name}
          className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
          {...(priority ? { loading: 'eager', fetchPriority: 'high' } : {})}
        />
        <div className='absolute inset-0 bg-linear-to-t from-background-dark/70 via-transparent to-transparent' />

        {!isAdmin && startingPrice && (
          <span className='absolute top-2 right-2 bg-background-light dark:bg-background-dark text-primary-light dark:text-primary-dark px-3 py-1 rounded-full text-sm font-semibold'>
            From ${startingPrice.toLocaleString()}
          </span>
        )}

        {/* Title & description overlay */}
        <div className='absolute bottom-4 left-4 right-4'>
          <div className='flex justify-between items-end'>
            <div>
              <Heading className='text-2xl font-bold text-background-light drop-shadow-md'>
                {name}
              </Heading>
              <p className='text-background-light/90 text-sm mt-1 line-clamp-1' title={description}>
                {description}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className='p-4'>
        <div className='flex justify-between items-center text-sm text-secondary-light dark:text-secondary-dark'>
          {!isAdmin && (
            <span className='flex items-center gap-1'>
              <MapPinIcon className='block size-6' /> {tourCount} Tour(s) Available
            </span>
          )}
          {isAdmin ? (
            <Link
              to={`${ROUTES.ADMIN_DESTINATIONS}/${destination_id}`}
              className='w-full inline-flex justify-center rounded-md bg-primary-light dark:bg-primary-dark px-4 py-2 text-sm font-medium text-background-light hover:bg-primary-light/90 dark:hover:bg-primary-dark/90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-background-light/75 transition-colors'
            >
              Edit Destination
            </Link>
          ) : (
            <Link
              to={`${ROUTES.DESTINATIONS}/${destination_id}`}
              className='flex items-center text-primary-light dark:text-primary-dark font-medium hover:underline'
            >
              Explore <span className='ml-1'>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
