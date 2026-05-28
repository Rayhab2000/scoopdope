'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { TranscriptDisplay } from '@/components/courses/TranscriptDisplay';
import { ChevronLeft, ChevronRight, Layout } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useVideoShortcuts } from '@/hooks/useVideoShortcuts';

export default function LessonPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params?.id;
  const lessonId = params?.lessonId;
  
  const [lesson, setLesson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useVideoShortcuts(videoRef);

  useEffect(() => {
    if (!lessonId) return;
    
    const fetchLesson = async () => {
      try {
        const { data } = await api.get(`/lessons/${lessonId}`);
        setLesson(data);
      } catch (error) {
        console.error('Failed to fetch lesson:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLesson();
  }, [lessonId]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  };

  if (loading) return <div className="p-8 text-center">Loading lesson...</div>;
  if (!lesson) return <div className="p-8 text-center">Lesson not found.</div>;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b dark:border-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/courses/${courseId}`)}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Course
          </Button>
          <h1 className="text-lg font-bold">{lesson.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Content (Video) */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative group">
              {lesson.videoUrl ? (
                <video
                  ref={videoRef}
                  src={lesson.videoUrl}
                  className="w-full h-full"
                  controls
                  onTimeUpdate={handleTimeUpdate}
                  data-testid="video-player"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  No video available for this lesson.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold">About this lesson</h2>
              <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                {lesson.content}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar (Transcript) */}
        <aside className="w-full lg:w-96 bg-white dark:bg-gray-900 border-t lg:border-t-0 lg:border-l dark:border-gray-800 flex flex-col h-[50vh] lg:h-auto">
          <div className="p-4 border-b dark:border-gray-800 flex items-center gap-2">
            <Layout className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold">Transcript</h3>
          </div>
          <div className="flex-1 overflow-hidden">
            <TranscriptDisplay
              lessonId={lessonId as string}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
