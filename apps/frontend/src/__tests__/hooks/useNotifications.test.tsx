import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/auth.store';
import { io, Socket } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useNotifications', () => {
  let mockSocket: Partial<Socket>;
  let eventHandlers: Record<string, (data: any) => void>;

  beforeEach(() => {
    eventHandlers = {};
    
    mockSocket = {
      on: vi.fn((event: string, handler: (data: any) => void) => {
        eventHandlers[event] = handler;
        return mockSocket as Socket;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };

    (io as any).mockReturnValue(mockSocket);
    
    // Set auth token
    useAuthStore.setState({ token: 'test-token', user: null });
    
    // Clear localStorage
    localStorageMock.clear();
    
    // Mock Audio
    global.Audio = vi.fn().mockImplementation(() => ({
      play: vi.fn().mockResolvedValue(undefined),
      volume: 0.5,
    })) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes WebSocket connection with auth token', () => {
    renderHook(() => useNotifications());

    expect(io).toHaveBeenCalledWith(
      'http://localhost:3000/notifications',
      expect.objectContaining({
        auth: { token: 'test-token' },
        transports: ['websocket'],
      })
    );
  });

  it('loads initial notifications from notifications:init event', async () => {
    const { result } = renderHook(() => useNotifications());

    const initialNotifications = [
      { id: '1', type: 'enrollment', message: 'Enrolled in course', isRead: false, createdAt: new Date().toISOString() },
      { id: '2', type: 'credential', message: 'Credential issued', isRead: true, createdAt: new Date().toISOString() },
    ];

    // Simulate notifications:init event
    eventHandlers['notifications:init'](initialNotifications);

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(2);
      expect(result.current.unreadCount).toBe(1);
    });
  });

  it('increments badge count when new notification arrives via WebSocket', async () => {
    const { result } = renderHook(() => useNotifications());

    // Start with no notifications
    eventHandlers['notifications:init']([]);

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(0);
    });

    // Simulate new notification event
    const newNotification = {
      id: '3',
      type: 'progress',
      message: 'Progress updated',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    eventHandlers['notification'](newNotification);

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.notifications[0]).toEqual(newNotification);
    });
  });

  it('triggers playSound flag when new notification arrives', async () => {
    const { result } = renderHook(() => useNotifications());

    eventHandlers['notifications:init']([]);

    await waitFor(() => {
      expect(result.current.playSound).toBe(false);
    });

    // Simulate new notification
    const newNotification = {
      id: '4',
      type: 'token_reward',
      message: 'Token reward received',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    eventHandlers['notification'](newNotification);

    await waitFor(() => {
      expect(result.current.playSound).toBe(true);
    });
  });

  it('plays audio when new notification arrives and sound is enabled', async () => {
    const mockPlay = vi.fn().mockResolvedValue(undefined);
    global.Audio = vi.fn().mockImplementation(() => ({
      play: mockPlay,
      volume: 0.5,
    })) as any;

    const { result } = renderHook(() => useNotifications());

    eventHandlers['notifications:init']([]);

    // Sound enabled by default (not set to 'false')
    const newNotification = {
      id: '5',
      type: 'general',
      message: 'General notification',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    eventHandlers['notification'](newNotification);

    await waitFor(() => {
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  it('does not play audio when sound is disabled', async () => {
    const mockPlay = vi.fn().mockResolvedValue(undefined);
    global.Audio = vi.fn().mockImplementation(() => ({
      play: mockPlay,
      volume: 0.5,
    })) as any;

    // Disable sound
    localStorageMock.setItem('notificationSound', 'false');

    const { result } = renderHook(() => useNotifications());

    eventHandlers['notifications:init']([]);

    const newNotification = {
      id: '6',
      type: 'general',
      message: 'General notification',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    eventHandlers['notification'](newNotification);

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });

    // Audio should not play
    expect(mockPlay).not.toHaveBeenCalled();
  });

  it('marks notifications as read and emits to socket', async () => {
    const { result } = renderHook(() => useNotifications());

    const initialNotifications = [
      { id: '7', type: 'enrollment', message: 'Test 1', isRead: false, createdAt: new Date().toISOString() },
      { id: '8', type: 'credential', message: 'Test 2', isRead: false, createdAt: new Date().toISOString() },
    ];

    eventHandlers['notifications:init'](initialNotifications);

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(2);
    });

    // Mark as read
    result.current.markAsRead(['7']);

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('notifications:markRead', ['7']);
    });

    // Simulate server confirmation
    eventHandlers['notifications:read'](['7']);

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
      expect(result.current.notifications[0].isRead).toBe(true);
    });
  });

  it('marks all notifications as read', async () => {
    const { result } = renderHook(() => useNotifications());

    const initialNotifications = [
      { id: '9', type: 'enrollment', message: 'Test 1', isRead: false, createdAt: new Date().toISOString() },
      { id: '10', type: 'credential', message: 'Test 2', isRead: false, createdAt: new Date().toISOString() },
    ];

    eventHandlers['notifications:init'](initialNotifications);

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(2);
    });

    // Mark all as read
    result.current.markAllRead();

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('notifications:markRead', ['9', '10']);
    });
  });

  it('disconnects socket on unmount', () => {
    const { unmount } = renderHook(() => useNotifications());

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('does not connect socket when no auth token', () => {
    useAuthStore.setState({ token: null, user: null });

    renderHook(() => useNotifications());

    expect(io).not.toHaveBeenCalled();
  });
});
