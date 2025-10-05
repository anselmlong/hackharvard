"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { GestureDetector } from "~/components/GestureDetector";

interface Question {
  text: string;
  answer: "yes" | "no";
}

const QUESTION_BANK: Question[] = [
  { text: "Is the sky blue?", answer: "yes" },
  { text: "Are fish mammals?", answer: "no" },
  { text: "Does 2 + 2 = 4?", answer: "yes" },
  { text: "Is the sun cold?", answer: "no" },
  { text: "Can humans breathe underwater?", answer: "no" },
  { text: "Is ice hot?", answer: "no" },
  { text: "Do birds have wings?", answer: "yes" },
  { text: "Is grass green?", answer: "yes" },
  { text: "If there are 5 apples and you take away 2, I have 3 apples left.", answer: "yes" },
  { text: "2 + 1 + 4 + 6 = 13", answer: "yes" },
  { text: "You can put metal in a microwave.", answer: "no" },
  { text: "One kilogram of feathers weighs more than one kilogram of steel.", answer: "no" },
  { text: "You can survive a hackathon without caffeine.", answer: "no" },
  { text: "There are 3 'r's in strawberry.", answer: "yes" },
];

export default function CaptchaChallengePage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [completed, setCompleted] = useState(false);

  // Pick 3 random questions on mount
  useEffect(() => {
    const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
    setQuestions(shuffled.slice(0, 3));
  }, []);

  const handleGesture = async (gesture: string) => {
    if (completed || !questions[currentIndex]) return;

    const expectedAnswer = questions[currentIndex].answer;

    const yesGestures = ["shake_vertical", "hold_up", "hold_down"];
    const noGestures = ["shake_horizontal", "hold_left", "hold_right"];

    const isCorrect =
      (expectedAnswer === "yes" && yesGestures.includes(gesture)) ||
      (expectedAnswer === "no" && noGestures.includes(gesture));

    if (isCorrect) {
      setFeedback("correct");

      // Clear buffer
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/gesture/detect", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      // Move to next question or complete
      setTimeout(() => {
        if (currentIndex === questions.length - 1) {
          setCompleted(true);
          setTimeout(() => router.push("/"), 2000);
        } else {
          setCurrentIndex(currentIndex + 1);
          setFeedback(null);
        }
      }, 1000);
    } else {
      setFeedback("wrong");

      // Clear buffer
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/gesture/detect", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      setTimeout(() => {
        setFeedback(null);
      }, 1500);
    }
  };

  if (questions.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black flex items-center justify-center text-white">
        <div className="text-sm">Loading...</div>
      </main>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-3xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-fuchsia-400 to-sky-300 bg-clip-text text-transparent">
            Freak-cha Verification
          </h1>
          <p className="text-sm text-white/60">
            Answer the questions using tongue gestures
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-full ${
                i < currentIndex
                  ? "bg-green-500"
                  : i === currentIndex
                    ? "bg-blue-500"
                    : "bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="text-2xl font-bold mb-4">{currentQuestion?.text ?? ""}</div>
          <div className="flex gap-4 justify-center text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span>Yes = Up/Down (hold or shake)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span>No = Left/Right (hold or shake)</span>
            </div>
          </div>
        </div>

        {/* Video with overlay */}
        <div className="relative">
          <GestureDetector onGesture={handleGesture} showDebug />

          {/* Feedback overlay */}
          {feedback === "correct" && (
            <div className="absolute inset-0 bg-green-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-4 border-green-500 pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-2">✓</div>
                <div className="text-2xl font-bold text-green-400">Correct!</div>
              </div>
            </div>
          )}

          {feedback === "wrong" && (
            <div className="absolute inset-0 bg-red-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-4 border-red-500 pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-2">✗</div>
                <div className="text-2xl font-bold text-red-400">Try Again!</div>
              </div>
            </div>
          )}

          {completed && (
            <div className="absolute inset-0 bg-green-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-4 border-green-500 pointer-events-none">
              <div className="text-center">
                <div className="text-6xl mb-4">🎉</div>
                <div className="text-3xl font-bold text-green-400">Verified!</div>
                <div className="text-sm text-white/60 mt-2">Redirecting...</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
