import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';
import UserComponent from './UserComponent';

describe('UserComponent', () => {
  it('shows loading state initially', () => {
    render(<UserComponent />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays user data after successful fetch', async () => {
    render(<UserComponent />);

    await waitFor(() => {
      expect(screen.getByText('User Profile')).toBeInTheDocument();
    });

    expect(screen.getByText(/Name: Leanne Graham/)).toBeInTheDocument();
    expect(screen.getByText(/Email: Sincere@april.biz/)).toBeInTheDocument();
    expect(screen.getByText(/Phone: 1-770-736-8031 x56442/)).toBeInTheDocument();
    expect(screen.getByText(/Website: hildegard.org/)).toBeInTheDocument();
  });

  it('displays error message when fetch fails', async () => {
    server.use(
      http.get('https://jsonplaceholder.typicode.com/users/1', () => {
        return HttpResponse.json(null, { status: 500 });
      })
    );

    render(<UserComponent />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('toggles theme when Switch Theme button is clicked', async () => {
    const user = userEvent.setup();
    render(<UserComponent />);

    await waitFor(() => {
      expect(screen.getByText('User Profile')).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: 'Switch Theme' });
    const container = screen.getByText('User Profile').closest('[data-theme]');

    expect(container).toHaveAttribute('data-theme', 'light');
    await user.click(button);
    expect(container).toHaveAttribute('data-theme', 'dark');
    await user.click(button);
    expect(container).toHaveAttribute('data-theme', 'light');
  });
});
