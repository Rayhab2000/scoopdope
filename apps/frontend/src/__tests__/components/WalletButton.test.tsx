import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWalletStore } from '@/store/walletStore';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/walletApi', () => ({
  isFreighterInstalled: vi.fn(),
  connectFreighter: vi.fn(),
  fetchXlmBalance: vi.fn(),
  truncateAddress: vi.fn((addr: string) =>
    addr.length > 8 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr,
  ),
}));

vi.mock('./WalletMenu', () => ({
  WalletMenu: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="wallet-menu">
      <button onClick={onClose}>Close Menu</button>
    </div>
  ),
}));

import { WalletButton } from '@/components/wallet/WalletButton';
import { isFreighterInstalled, connectFreighter, fetchXlmBalance } from '@/lib/walletApi';

const mockIsFreighterInstalled = vi.mocked(isFreighterInstalled);
const mockConnectFreighter = vi.mocked(connectFreighter);
const mockFetchXlmBalance = vi.mocked(fetchXlmBalance);

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetWalletStore() {
  useWalletStore.setState({
    address: null,
    balance: null,
    bstBalance: null,
    bstBalanceRefreshKey: 0,
    isConnecting: false,
    error: null,
    balanceError: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletButton', () => {
  beforeEach(() => {
    resetWalletStore();
    vi.clearAllMocks();
  });

  // ── Initial render ──────────────────────────────────────────────────────────

  describe('initial render (no wallet connected)', () => {
    it('renders the Connect Wallet button', () => {
      mockIsFreighterInstalled.mockReturnValue(true);
      render(<WalletButton />);
      expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument();
    });

    it('does not render a truncated address when disconnected', () => {
      mockIsFreighterInstalled.mockReturnValue(true);
      render(<WalletButton />);
      expect(screen.queryByText(/…/)).not.toBeInTheDocument();
    });
  });

  // ── Successful connect flow ─────────────────────────────────────────────────

  describe('successful connect flow', () => {
    const publicKey = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVW';

    beforeEach(() => {
      mockIsFreighterInstalled.mockReturnValue(true);
      mockConnectFreighter.mockResolvedValue(publicKey);
      mockFetchXlmBalance.mockResolvedValue('100.5');
    });

    it('shows loading spinner while connecting', async () => {
      const user = userEvent.setup();
      // Delay resolution so we can observe the loading state
      mockConnectFreighter.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(publicKey), 100)),
      );

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      expect(screen.getByText(/connecting/i)).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('updates walletStore address after successful connection', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().address).toBe(publicKey);
      });
    });

    it('updates walletStore balance after successful connection', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().balance).toBe('100.5');
      });
    });

    it('renders connected state with truncated address', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        // After connecting, the address toggle button should appear
        expect(screen.getByRole('button', { name: /GABC…QRSTUVW/i })).toBeInTheDocument();
      });
    });

    it('clears isConnecting flag after successful connection', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().isConnecting).toBe(false);
      });
    });

    it('sets balanceError to true when balance fetch fails', async () => {
      const user = userEvent.setup();
      mockFetchXlmBalance.mockRejectedValue(new Error('Network error'));
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().balanceError).toBe(true);
        expect(useWalletStore.getState().balance).toBeNull();
      });
    });
  });

  // ── Rejection flow ──────────────────────────────────────────────────────────

  describe('user rejection flow', () => {
    beforeEach(() => {
      mockIsFreighterInstalled.mockReturnValue(true);
    });

    it('shows "Connection cancelled" message when user rejects the connection', async () => {
      const user = userEvent.setup();
      mockConnectFreighter.mockRejectedValue(new Error('FREIGHTER_NOT_CONNECTED'));

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByText(/connection cancelled/i)).toBeInTheDocument();
      });
    });

    it('resets isConnecting to false after user rejects', async () => {
      const user = userEvent.setup();
      mockConnectFreighter.mockRejectedValue(new Error('FREIGHTER_NOT_CONNECTED'));

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().isConnecting).toBe(false);
      });
    });

    it('does not update the address when user rejects', async () => {
      const user = userEvent.setup();
      mockConnectFreighter.mockRejectedValue(new Error('FREIGHTER_NOT_CONNECTED'));

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(useWalletStore.getState().address).toBeNull();
      });
    });

    it('shows generic error message for non-rejection errors', async () => {
      const user = userEvent.setup();
      mockConnectFreighter.mockRejectedValue(new Error('Some unexpected error'));

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByText(/failed to connect wallet/i)).toBeInTheDocument();
      });
    });

    it('dismissing the error message clears the error state', async () => {
      const user = userEvent.setup();
      mockConnectFreighter.mockRejectedValue(new Error('FREIGHTER_NOT_CONNECTED'));

      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Dismiss' }));

      expect(screen.queryByText(/connection cancelled/i)).not.toBeInTheDocument();
      expect(useWalletStore.getState().error).toBeNull();
    });
  });

  // ── Freighter not installed ─────────────────────────────────────────────────

  describe('Freighter not installed', () => {
    beforeEach(() => {
      mockIsFreighterInstalled.mockReturnValue(false);
    });

    it('shows install prompt when Freighter is not installed', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByText(/freighter not found/i)).toBeInTheDocument();
      });
    });

    it('renders a link to the Freighter installation page', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /install freighter/i });
        expect(link).toHaveAttribute('href', 'https://www.freighter.app/');
        expect(link).toHaveAttribute('target', '_blank');
      });
    });

    it('does not call connectFreighter when Freighter is not installed', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByText(/freighter not found/i)).toBeInTheDocument();
      });

      expect(mockConnectFreighter).not.toHaveBeenCalled();
    });

    it('dismisses the install prompt when the Dismiss button is clicked', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);
      await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));

      await waitFor(() => {
        expect(screen.getByText(/freighter not found/i)).toBeInTheDocument();
      });

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
      await user.click(dismissBtn);

      expect(screen.queryByText(/freighter not found/i)).not.toBeInTheDocument();
    });
  });

  // ── Connected state ─────────────────────────────────────────────────────────

  describe('connected state (address already in store)', () => {
    const storedAddress = 'GABC1234WXYZ5678';

    beforeEach(() => {
      useWalletStore.setState({ address: storedAddress });
    });

    it('renders the wallet menu toggle button when connected', () => {
      render(<WalletButton />);
      const btn = screen.getByRole('button', { name: /GABC…5678/i });
      expect(btn).toBeInTheDocument();
    });

    it('shows the green status dot indicating connection', () => {
      render(<WalletButton />);
      // The green dot is a decorative span with aria-hidden
      const dot = document.querySelector('.bg-green-500');
      expect(dot).toBeInTheDocument();
    });

    it('opens the WalletMenu on button click', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);

      await user.click(screen.getByRole('button', { name: /GABC…5678/i }));
      expect(screen.getByTestId('wallet-menu')).toBeInTheDocument();
    });

    it('closes the WalletMenu when onClose is triggered', async () => {
      const user = userEvent.setup();
      render(<WalletButton />);

      await user.click(screen.getByRole('button', { name: /GABC…5678/i }));
      expect(screen.getByTestId('wallet-menu')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close Menu' }));
      expect(screen.queryByTestId('wallet-menu')).not.toBeInTheDocument();
    });
  });
});
