import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../components/Pagination/Pagination';
import { SmartImage } from '../components/SmartImage/SmartImage';
import { StarRating } from '../pages/Tours/components/StarRating';

describe('Pagination', () => {
  it('has accessible controls and disables them at the edges', async () => {
    const next = vi.fn();
    const prev = vi.fn();
    render(<Pagination page={1} totalPages={3} goToNextPage={next} goToPrevPage={prev} />);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(next).toHaveBeenCalledWith(3);
  });
});

describe('SmartImage', () => {
  it('shows a placeholder instead of a broken image', () => {
    render(
      <SmartImage src='https://example.invalid/missing.webp' alt='Gold Coast' className='h-10' />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'Gold Coast' }));
    const placeholder = screen.getByRole('img', { name: 'Gold Coast' });
    expect(placeholder.tagName).toBe('DIV');
  });

  it('falls back from the card copy to the full image, then to the placeholder', () => {
    render(
      <SmartImage
        src='https://cdn.test/bali_card.webp'
        fallbackSrc='https://cdn.test/bali.webp'
        alt='Bali'
      />,
    );
    const card = screen.getByRole('img', { name: 'Bali' });
    expect(card).toHaveAttribute('src', 'https://cdn.test/bali_card.webp');

    fireEvent.error(card);
    const full = screen.getByRole('img', { name: 'Bali' });
    expect(full).toHaveAttribute('src', 'https://cdn.test/bali.webp');

    fireEvent.error(full);
    expect(screen.getByRole('img', { name: 'Bali' }).tagName).toBe('DIV');
  });

  it('renders the placeholder when there is no source', () => {
    render(<SmartImage src={undefined} alt='No photo' />);
    expect(screen.getByRole('img', { name: 'No photo' }).tagName).toBe('DIV');
  });
});

describe('StarRating', () => {
  it('exposes the stars as a labelled radio group', async () => {
    const onChange = vi.fn();
    render(<StarRating value={2} onChange={onChange} />);

    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2 stars' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
