import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import SignInPage from '../pages/Auth/SignInPage';
import SignUpPage from '../pages/Auth/SignUpPage';
import { ContactForm } from '../pages/Contact/components/ContactForm';
import { ReviewForm } from '../pages/Tours/components/ReviewForm';
import { PasswordChangeForm } from '../pages/Profile/components/PasswordChangeForm';
import { useAuthStore } from '../store';
import { customer, mockApi, renderWithProviders, restoreApi, signInAs } from './utils';
import type { MockRequest } from './utils';

const marker = (text: string) => <p>{text}</p>;

// Pages may load data on their own (e.g. the sign-in page asks whether demo accounts are on);
// these tests are about what the forms send.
const writes = (calls: MockRequest[]) => calls.filter((c) => c.method !== 'GET');

afterEach(() => {
  cleanup();
  toast.dismiss();
  restoreApi();
  useAuthStore.getState().logout();
});

describe('SignInPage', () => {
  const renderSignIn = () =>
    renderWithProviders(<SignInPage />, {
      route: '/auth/sign-in',
      routes: [{ path: '/', element: marker('Home page') }],
    });

  it('shows validation messages and does not call the API for an empty form', async () => {
    const calls = mockApi(() => ({ data: {} }));
    renderSignIn();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is too short')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('posts the credentials, stores the session and goes home', async () => {
    const calls = mockApi((req) =>
      req.url === '/auth/signin' ? { data: { token: 'access', user: customer } } : undefined,
    );
    renderSignIn();

    await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Home page')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        method: 'POST',
        url: '/auth/signin',
        body: { email: 'jane@example.com', password: 'Str0ng!Pass' },
      }),
    ]);
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      accessToken: 'access',
      user: customer,
    });
  });

  it('shows the server message when the credentials are rejected', async () => {
    mockApi(() => ({ status: 401, data: { message: 'Invalid email or password' } }));
    renderSignIn();

    await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.queryByText('Home page')).not.toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('SignUpPage', () => {
  const renderSignUp = () =>
    renderWithProviders(<SignUpPage />, {
      route: '/auth/sign-up',
      routes: [{ path: '/auth/sign-in', element: marker('Sign in page') }],
    });

  const fillValid = async () => {
    await userEvent.type(screen.getByLabelText('Full name'), 'Jane Traveller');
    await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('checkbox'));
  };

  it('flags a weak password, a mismatched confirmation and unaccepted terms', async () => {
    const calls = mockApi(() => ({ data: {} }));
    renderSignUp();

    await userEvent.type(screen.getByLabelText('Full name'), 'Jane Traveller');
    await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'weakpassword');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('Password must include at least one uppercase letter'),
    ).toBeInTheDocument();
    expect(screen.getByText('You must accept the terms and conditions')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("reports passwords that don't match", async () => {
    mockApi(() => ({ data: {} }));
    renderSignUp();
    await fillValid();
    await userEvent.clear(screen.getByLabelText('Confirm password'));
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Str0ng!Pazz');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
  });

  it('registers with the form payload and sends the user to sign in', async () => {
    const calls = mockApi((req) =>
      req.url === '/auth/signup' ? { status: 201, data: { message: 'ok' } } : undefined,
    );
    renderSignUp();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({
      method: 'POST',
      url: '/auth/signup',
      body: {
        full_name: 'Jane Traveller',
        email: 'jane@example.com',
        password: 'Str0ng!Pass',
        confirm_password: 'Str0ng!Pass',
        terms: true,
      },
    });
  });

  it('stays on the page and shows the error when the email is taken', async () => {
    mockApi(() => ({ status: 409, data: { message: 'Email already in use' } }));
    renderSignUp();
    await fillValid();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
    expect(screen.queryByText('Sign in page')).not.toBeInTheDocument();
  });
});

describe('ContactForm', () => {
  it('validates every field before sending', async () => {
    const calls = mockApi(() => ({ data: {} }));
    renderWithProviders(<ContactForm />);

    await userEvent.type(screen.getByLabelText('Full name'), 'J');
    // Passes the browser's own type=email check, so the schema's message is what shows.
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example');
    await userEvent.type(screen.getByLabelText('Phone number'), '12');
    await userEvent.type(screen.getByLabelText('Message'), 'Hi');
    await userEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(await screen.findByText('Full name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Phone number must be at least 9 digits')).toBeInTheDocument();
    expect(screen.getByText('Message must be at least 10 characters')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('sends the message, confirms it and clears the form', async () => {
    const calls = mockApi((req) => (req.url === '/contact' ? { data: { ok: true } } : undefined));
    renderWithProviders(<ContactForm />);

    await userEvent.type(screen.getByLabelText('Full name'), 'Jane Traveller');
    await userEvent.type(screen.getByLabelText('Email'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Phone number'), '+1 555 123 4567');
    await userEvent.type(screen.getByLabelText('Message'), 'Planning a honeymoon in Bali.');
    await userEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(await screen.findByText(/Message sent!/)).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({
      method: 'POST',
      url: '/contact',
      body: {
        full_name: 'Jane Traveller',
        email: 'jane@example.com',
        phone_number: '+1 555 123 4567',
        message: 'Planning a honeymoon in Bali.',
      },
    });
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue(''));
    expect(screen.getByLabelText('Message')).toHaveValue('');
  });
});

describe('ReviewForm', () => {
  it('requires a star rating and a long enough review', async () => {
    signInAs(customer);
    const calls = mockApi(() => ({ data: {} }));
    renderWithProviders(<ReviewForm tourId={12} />);

    await userEvent.type(screen.getByLabelText('Your Review'), 'Meh');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

    expect(await screen.findByText('Minimum rating is 1')).toBeInTheDocument();
    expect(screen.getByText('Review must be at least 5 characters')).toBeInTheDocument();

    // Picking a star clears the rating error straight away (validated on change).
    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await waitFor(() => expect(screen.queryByText('Minimum rating is 1')).not.toBeInTheDocument());
    expect(writes(calls)).toHaveLength(0);
  });

  it('rejects links in the review text', async () => {
    signInAs(customer);
    mockApi(() => ({ data: {} }));
    renderWithProviders(<ReviewForm tourId={12} />);

    await userEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    await userEvent.type(screen.getByLabelText('Your Review'), 'Book at https://spam.example');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

    expect(await screen.findByText('Links are not allowed in reviews')).toBeInTheDocument();
  });

  it('submits the rating and comment for the tour, then resets', async () => {
    signInAs(customer);
    const calls = mockApi((req) => (req.url === '/review' ? { status: 201, data: {} } : undefined));
    let submitted = 0;
    renderWithProviders(<ReviewForm tourId={12} onReviewSubmitted={() => submitted++} />);

    await userEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    await userEvent.type(screen.getByLabelText('Your Review'), 'Wonderful guides and food.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

    expect(await screen.findByText('Review submitted successfully!')).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({
      method: 'POST',
      url: '/review',
      body: { tour_id: 12, rating: 4, comment: 'Wonderful guides and food.' },
    });
    expect(submitted).toBe(1);
    expect(screen.getByLabelText('Your Review')).toHaveValue('');
    expect(screen.getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'false');
  });

  it('sends a signed-out visitor to sign in instead of posting', async () => {
    const calls = mockApi(() => ({ data: {} }));
    renderWithProviders(<ReviewForm tourId={12} />, {
      route: '/tours/12',
      routes: [{ path: '/auth/sign-in', element: marker('Sign in page') }],
    });

    await userEvent.click(screen.getByRole('radio', { name: '3 stars' }));
    await userEvent.type(screen.getByLabelText('Your Review'), 'Lovely trip overall.');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Review' }));

    expect(await screen.findByText('Sign in page')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });
});

describe('PasswordChangeForm', () => {
  it('keeps submit disabled until edited, and Cancel clears the fields', async () => {
    renderWithProviders(<PasswordChangeForm />);
    const submit = screen.getByRole('button', { name: 'Change Password' });

    expect(submit).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Current Password'), 'OldPass1!');
    expect(submit).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Current Password')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('shows a mismatch error and does not call the API', async () => {
    signInAs(customer);
    const calls = mockApi(() => ({ data: {} }));
    renderWithProviders(<PasswordChangeForm />);

    await userEvent.type(screen.getByLabelText('Current Password'), 'OldPass1!');
    await userEvent.type(screen.getByLabelText('New Password'), 'NewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'NewPass2!');
    await userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it('keeps what the user typed when the server rejects the change', async () => {
    signInAs(customer);
    mockApi((req) =>
      req.url === '/account/password'
        ? { status: 400, data: { message: 'Incorrect current password' } }
        : undefined,
    );
    renderWithProviders(<PasswordChangeForm />);

    await userEvent.type(screen.getByLabelText('Current Password'), 'WrongPass1!');
    await userEvent.type(screen.getByLabelText('New Password'), 'NewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'NewPass1!');
    await userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Incorrect current password')).toBeInTheDocument();
    expect(screen.getByLabelText('Current Password')).toHaveValue('WrongPass1!');
  });

  it('a network error on sign-in still shows a message', async () => {
    mockApi((req) => (req.url === '/auth/signin' ? { status: 599 } : undefined));
    renderWithProviders(<SignInPage />, { route: '/auth/sign-in' });
    await userEvent.type(screen.getByLabelText('Email address'), 'jane@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Str0ng!Pass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Request failed|Sign-in failed/)).toBeInTheDocument();
  });

  it('sends only the current and new password', async () => {
    signInAs(customer);
    const calls = mockApi((req) => (req.url === '/account/password' ? { data: {} } : undefined));
    renderWithProviders(<PasswordChangeForm />);

    await userEvent.type(screen.getByLabelText('Current Password'), 'OldPass1!');
    await userEvent.type(screen.getByLabelText('New Password'), 'NewPass1!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'NewPass1!');
    await userEvent.click(screen.getByRole('button', { name: 'Change Password' }));

    expect(await screen.findByText('Password changed successfully')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      expect.objectContaining({
        method: 'PUT',
        url: '/account/password',
        body: { current_password: 'OldPass1!', new_password: 'NewPass1!' },
      }),
    ]);
    expect(screen.getByLabelText('Current Password')).toHaveValue('');
  });
});
