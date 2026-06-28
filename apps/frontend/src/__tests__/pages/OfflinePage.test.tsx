import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const reloadMock = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true,
});

import OfflinePage from '@/app/offline/page';

beforeEach(() => reloadMock.mockClear());
afterEach(() => vi.restoreAllMocks());

describe('OfflinePage', () => {
  it('renders offline message and Try Again button', () => {
    render(<OfflinePage />);
    expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls window.location.reload when Try Again is clicked', async () => {
    render(<OfflinePage />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('shows Reconnecting... and reloads when online event fires', () => {
    render(<OfflinePage />);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it('removes the online event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<OfflinePage />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
  });
});
