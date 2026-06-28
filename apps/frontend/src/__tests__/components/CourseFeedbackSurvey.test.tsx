import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseFeedbackSurvey } from '@/components/surveys/CourseFeedbackSurvey';

vi.mock('@/lib/api', () => ({ default: { post: vi.fn() } }));

const survey = {
  id: 's1',
  title: 'Test Survey',
  description: '',
  allowAnonymous: false,
  questions: [
    { id: 'q1', text: 'What did you enjoy?', type: 'text' as const, required: false },
  ],
};

describe('CourseFeedbackSurvey character counter', () => {
  it('shows 0 / 500 initially', () => {
    render(<CourseFeedbackSurvey survey={survey} />);
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('updates the counter as the user types', () => {
    render(<CourseFeedbackSurvey survey={survey} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
    expect(screen.getByText('5 / 500')).toBeInTheDocument();
  });

  it('applies amber styling at 80% of limit (400 chars)', () => {
    render(<CourseFeedbackSurvey survey={survey} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(400) } });
    expect(screen.getByText('400 / 500')).toHaveClass('text-amber-500');
  });

  it('applies red styling at 100% of limit (500 chars)', () => {
    render(<CourseFeedbackSurvey survey={survey} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(500) } });
    expect(screen.getByText('500 / 500')).toHaveClass('text-red-500');
  });

  it('counter is neutral below 80%', () => {
    render(<CourseFeedbackSurvey survey={survey} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(300) } });
    const counter = screen.getByText('300 / 500');
    expect(counter).not.toHaveClass('text-amber-500');
    expect(counter).not.toHaveClass('text-red-500');
  });
});
