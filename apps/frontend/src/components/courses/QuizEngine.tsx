'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface QuizAnswer {
  id: string;
  text: string;
  isCorrect?: boolean;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'true_false' | 'essay';
  points: number;
  answers: QuizAnswer[];
}

interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
}

interface QuizEngineProps {
  quizId: string;
  onComplete?: (score: number) => void;
}

export const QuizEngine: React.FC<QuizEngineProps> = ({ quizId, onComplete }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [quizRes, attemptsRes] = await Promise.all([
          api.get(`/v1/quizzes/${quizId}`),
          api.get(`/v1/quizzes/${quizId}/attempts`),
        ]);
        
        setQuiz(quizRes.data);
        
        // If there's an existing attempt, we can't show correct answers easily 
        // unless the backend returns them for that attempt.
        // For now, if an attempt exists, we just show that it's completed.
        if (attemptsRes.data && attemptsRes.data.length > 0) {
          setResult(attemptsRes.data[0]);
        }
      } catch (error) {
        console.error('Failed to fetch quiz data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [quizId]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;

    const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));

    setSubmitting(true);
    try {
      const response = await api.post(`/v1/quizzes/${quizId}/submit`, {
        answers: formattedAnswers,
      });
      setResult(response.data);
      if (onComplete) onComplete(response.data.score);
      toast.success(`Quiz submitted! Score: ${response.data.score}%`);
    } catch (error: any) {
      // toast is already handled by api interceptor
      console.error('Submission failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!quiz) return <Card>Quiz not found.</Card>;

  if (result) {
    return (
      <Card className="p-6">
        <h2 className="text-2xl font-bold mb-4">Quiz Results</h2>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-6">
          <p className="text-lg">
            Your Score: <span className="font-bold text-blue-600 dark:text-blue-400">{Math.round(result.score)}%</span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Submitted on {new Date(result.submittedAt).toLocaleDateString()}
          </p>
        </div>

        {result.gradedAnswers && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold border-b pb-2">Review Answers</h3>
            {quiz.questions.map((question) => {
              const graded = result.gradedAnswers.find((ga: any) => ga.questionId === question.id);
              return (
                <div key={question.id} className="space-y-2">
                  <p className="font-medium text-gray-900 dark:text-white">{question.text}</p>
                  <div className="pl-4 border-l-2 space-y-1">
                    <p className={`text-sm ${graded?.isCorrect ? 'text-green-600' : 'text-red-600 font-semibold'}`}>
                      Your Answer: {graded?.userAnswer || 'No answer'}
                    </p>
                    {!graded?.isCorrect && (
                      <p className="text-sm text-green-600 font-medium">
                        Correct Answer: {graded?.correctAnswer}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!result.gradedAnswers && (
          <p className="text-gray-600 dark:text-gray-400">
            You have already completed this quiz. Re-submission is not allowed.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">{quiz.title}</h2>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Please answer all questions before submitting.
        </p>
      </div>

      <div className="space-y-10">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {index + 1}. {question.text}
            </h3>
            
            {question.type === 'essay' ? (
              <textarea
                className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                rows={4}
                placeholder="Type your answer here..."
                value={answers[question.id] || ''}
                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {question.answers.map((answer) => (
                  <label
                    key={answer.id}
                    className={`flex items-center space-x-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      answers[question.id] === answer.text
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-100 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={answer.text}
                      checked={answers[question.id] === answer.text}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700 dark:text-gray-200 font-medium">{answer.text}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 flex items-center justify-between border-t pt-8">
        <div className="text-sm text-gray-500">
          {Object.keys(answers).length} of {quiz.questions.length} questions answered
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitting || Object.keys(answers).length < quiz.questions.length}
          className="px-10 py-3 text-lg"
          variant="primary"
        >
          {submitting ? 'Submitting...' : 'Submit Quiz'}
        </Button>
      </div>
    </Card>
  );
};
