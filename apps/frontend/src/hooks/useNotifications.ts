import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth.store';

export type NotificationType = 'enrollment' | 'progress' | 'credential' | 'token_reward' | 'general';

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<NotificationType, string> = {
  enrollment: '📚',
  progress: '📈',
  credential: '🏆',
  token_reward: '🪙',
  general: '🔔',
};

export { TYPE_ICONS };

export function useNotifications() {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [playSound, setPlaySound] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/notification-sound.mp3');
      audioRef.current.volume = 0.5;
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket = io(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/notifications`,
      { auth: { token }, transports: ['websocket'] }
    );
    socketRef.current = socket;

    // Load existing notifications on connect
    socket.on('notifications:init', (initial: AppNotification[]) => {
      setNotifications(initial);
    });

    // New incoming notification
    socket.on('notification', (n: AppNotification) => {
      setNotifications((prev) => [n, ...prev]);
      
      // Trigger sound and visual feedback
      setPlaySound(true);
      
      // Play notification sound if enabled
      const soundEnabled = localStorage.getItem('notificationSound') !== 'false';
      if (soundEnabled && audioRef.current) {
        audioRef.current.play().catch(() => {
          // Ignore errors (e.g., user hasn't interacted with page yet)
        });
      }
      
      // Reset pulse animation after delay
      setTimeout(() => setPlaySound(false), 1000);
    });

    // Server confirms mark-as-read
    socket.on('notifications:read', (ids: string[]) => {
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const markAsRead = useCallback((ids: string[]) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
    );
    socketRef.current?.emit('notifications:markRead', ids);
  }, []);

  const markAllRead = useCallback(() => {
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length) markAsRead(unreadIds);
  }, [notifications, markAsRead]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, markAsRead, markAllRead, playSound };
}
