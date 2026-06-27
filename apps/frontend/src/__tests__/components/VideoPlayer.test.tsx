import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoPlayer } from '@/components/courses/VideoPlayer';

// Mock the useVideoShortcuts hook – it binds keyboard listeners we don't need in these tests
vi.mock('@/hooks/useVideoShortcuts', () => ({
  useVideoShortcuts: vi.fn(),
}));

const defaultProps = {
  src: 'https://example.com/video.mp4',
  lessonId: 'lesson-1',
  courseId: 'course-1',
};

describe('VideoPlayer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a video element by default', () => {
    render(<VideoPlayer {...defaultProps} />);
    const video = document.querySelector('video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', defaultProps.src);
  });

  it('shows error UI when the video fires an error event', () => {
    render(<VideoPlayer {...defaultProps} />);
    const video = document.querySelector('video')!;

    // Simulate a video load error
    fireEvent.error(video);

    // The video element should be replaced by the error state
    expect(document.querySelector('video')).not.toBeInTheDocument();

    // Error message should be visible
    expect(screen.getByText('Video failed to load')).toBeInTheDocument();
    expect(
      screen.getByText(/network issue or an unsupported format/),
    ).toBeInTheDocument();

    // Retry button should be present
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // The error container should have role="alert" for accessibility
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('restores the video element when Retry is clicked', async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...defaultProps} />);
    const video = document.querySelector('video')!;

    // Trigger error
    fireEvent.error(video);
    expect(document.querySelector('video')).not.toBeInTheDocument();

    // Click Retry
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // Video should be rendered again
    const restoredVideo = document.querySelector('video');
    expect(restoredVideo).toBeInTheDocument();
  });

  it('appends a cache-busting query param on retry', async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...defaultProps} />);

    // First error + retry
    fireEvent.error(document.querySelector('video')!);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    const video1 = document.querySelector('video')!;
    expect(video1.getAttribute('src')).toBe(
      'https://example.com/video.mp4?_retry=1',
    );

    // Second error + retry
    fireEvent.error(video1);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    const video2 = document.querySelector('video')!;
    expect(video2.getAttribute('src')).toBe(
      'https://example.com/video.mp4?_retry=2',
    );
  });

  it('handles src with existing query params on retry', async () => {
    const user = userEvent.setup();
    render(
      <VideoPlayer
        {...defaultProps}
        src="https://example.com/video.mp4?token=abc"
      />,
    );

    fireEvent.error(document.querySelector('video')!);
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    const video = document.querySelector('video')!;
    expect(video.getAttribute('src')).toBe(
      'https://example.com/video.mp4?token=abc&_retry=1',
    );
  });
});
