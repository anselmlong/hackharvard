"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { GestureDetector } from "./GestureDetector";

interface Question {
  text: string;
  answer: "yes" | "no";
}

const QUESTION_BANK: Question[] = [
  { text: "If there are 5 apples and you take away 2, I have 3 apples left.", answer: "yes" },
  { text: "2 + 1 + 4 + 6 = 13", answer: "yes" },
  { text: "You can put metal in a microwave.", answer: "no" },
  { text: "One kilogram of feathers weighs more than one kilogram of steel.", answer: "no" },
  { text: "You can survive a hackathon without caffeine.", answer: "no" },
  { text: "There are 3 'r's in strawberry.", answer: "yes" },
];

interface CaptchaProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
  failurePercentage?: number; // 0-100, chance of simulated failure
  questionCount?: number; // Number of questions to ask
}

export function Captcha({
  onSuccess,
  onError,
  failurePercentage = 50,
  questionCount = 1,
}: CaptchaProps) {
  const supabase = supabaseBrowser();
  const [state, setState] = useState<"idle" | "checking" | "failed" | "success">("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  // Pick random questions when dialog opens
  useEffect(() => {
    if (dialogOpen && questions.length === 0) {
      const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
      setQuestions(shuffled.slice(0, questionCount));
      setCurrentIndex(0);
    }
  }, [dialogOpen, questions.length, questionCount]);

  const handleClick = () => {
    setState("checking");

    // Simulate verification
    setTimeout(() => {
      const shouldFail = Math.random() * 100 < failurePercentage;

      if (shouldFail) {
        setState("failed");
        setDialogOpen(true);
      } else {
        setState("success");
        onSuccess();
      }
    }, 1500);
  };

  const handleGesture = async (gesture: string) => {
    // Ignore gestures while showing feedback
    if (feedback !== null) return;

    if (!questions[currentIndex]) return;

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
          // All questions answered!
          setDialogOpen(false);
          setState("success");
          onSuccess();
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

  const getCheckboxState = () => {
    if (state === "success") return "✓";
    if (state === "checking") return "⟳";
    return "";
  };

  return (
    <>
      {/* Turnstile-style CAPTCHA */}
      <div className="inline-block border border-gray-300 rounded bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClick}
            disabled={state === "checking" || state === "success"}
            className={`w-6 h-6 border-2 rounded flex items-center justify-center text-sm font-bold transition ${
              state === "success"
                ? "bg-green-500 border-green-600 text-white"
                : state === "checking"
                  ? "border-gray-400 animate-spin"
                  : "border-gray-400 hover:border-gray-500 cursor-pointer"
            }`}
          >
            {getCheckboxState()}
          </button>
          <span className="text-sm text-gray-700">
            {state === "success" ? "Verified" : "I'm not a robot"}
          </span>
        </div>
        <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
          <span>Protected by</span>
          <span className="font-semibold">Freak-cha</span>
        </div>
      </div>

      {/* Verification Dialog */}
      {dialogOpen && questions.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Verify You're Human
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Answer using tongue gestures
              </p>
            </div>

            {/* Progress */}
            {questions.length > 1 && (
              <div className="flex items-center gap-2">
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-2 rounded-full ${
                      i < currentIndex
                        ? "bg-green-500"
                        : i === currentIndex
                          ? "bg-blue-500"
                          : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Question */}
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <div className="text-xl font-bold text-gray-900 mb-4">
                {questions[currentIndex].text}
              </div>
              <div className="flex gap-4 justify-center text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span>Yes = Up/Down</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span>No = Left/Right</span>
                </div>
              </div>
            </div>

            {/* Video with GestureDetector */}
            <div className="relative">
              <GestureDetector onGesture={handleGesture} showDebug />

              {/* Feedback overlay */}
              {feedback === "correct" && (
                <div className="absolute inset-0 bg-green-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-4 border-green-500 pointer-events-none">
                  <div className="text-center">
                    <div className="text-6xl mb-2">✓</div>
                    <div className="text-2xl font-bold text-green-600">
                      Correct!
                    </div>
                  </div>
                </div>
              )}

              {feedback === "wrong" && (
                <div className="absolute inset-0 bg-red-500/20 backdrop-blur-sm rounded-lg flex items-center justify-center border-4 border-red-500 pointer-events-none">
                  <div className="text-center">
                    <div className="text-6xl mb-2">✗</div>
                    <div className="text-2xl font-bold text-red-600">
                      Try Again!
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
