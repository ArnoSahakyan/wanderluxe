import { Link } from 'react-router-dom';
import { IBlog, ROUTES } from '../../shared';
import { FC } from 'react';
import { formatDate } from '../../utils';
import { SmartImage } from '../SmartImage/SmartImage';

interface BlogPost {
  post: IBlog;
  /** h2 when the card sits directly under the page's h1. */
  headingLevel?: 'h2' | 'h3';
}

export const BlogCard: FC<BlogPost> = ({ post, headingLevel: Heading = 'h3' }) => {
  return (
    <article className='relative isolate flex flex-col justify-end overflow-hidden rounded-2xl bg-gray-900 px-8 pb-8 pt-80 sm:pt-48 lg:pt-80 hover:shadow-lg transition-shadow'>
      <SmartImage
        alt=''
        src={post.image_card || post.image}
        fallbackSrc={post.image}
        className='absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 hover:scale-105'
      />
      <div className='absolute inset-0 -z-10 bg-linear-to-t from-gray-900 via-gray-900/40' />
      <div className='absolute inset-0 -z-10 rounded-2xl ring-1 ring-inset ring-gray-900/10' />

      <div className='flex flex-wrap items-center gap-y-1 overflow-hidden text-sm/6 text-gray-300'>
        <p className='mr-8'>{formatDate(post.createdAt)}</p>
      </div>

      <Heading className='mt-3 text-lg/6 font-semibold text-white'>
        <Link to={`${ROUTES.BLOG}/${post.slug}`}>
          <span className='absolute inset-0' />
          {post.title}
        </Link>
      </Heading>
      <p className='mt-2 line-clamp-2 text-sm/6 text-gray-300'>{post.excerpt}</p>
    </article>
  );
};
