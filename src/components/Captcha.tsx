"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { GestureDetector } from "./GestureDetector";

interface Question {
  text: string;
  answer: "yes" | "no";
}

const QUESTION_BANK: Question[] = [
  {
    text: "If there are 5 apples and you take away 2, I have 3 apples left.",
    answer: "yes",
  },
  { text: "2 + 1 + 4 + 6 = 13", answer: "yes" },
  { text: "You can put metal in a microwave.", answer: "no" },
  {
    text: "One kilogram of feathers weighs more than one kilogram of steel.",
    answer: "no",
  },
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
  const [state, setState] = useState<
    "idle" | "checking" | "failed" | "success"
  >("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [liveMessage, setLiveMessage] = useState<string>("");
  const [animateIn, setAnimateIn] = useState(false);
  const [lastDetection, setLastDetection] = useState<string>("no_tongue");
  const [lastConfidence, setLastConfidence] = useState<number>(0);

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
        setLiveMessage(
          "Additional verification required. Answer the question using gestures.",
        );
      } else {
        setState("success");
        onSuccess();
        setLiveMessage("Verification successful");
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
      setLiveMessage("Correct answer");

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
          setLiveMessage("Verification complete. You are verified.");
        } else {
          setCurrentIndex(currentIndex + 1);
          setFeedback(null);
          setLiveMessage(`Question ${currentIndex + 2} of ${questions.length}`);
        }
      }, 1000);
    } else {
      setFeedback("wrong");
      setLiveMessage("Incorrect answer. Try again.");

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
    if (state === "checking") return "";
    return "";
  };

  // Focus the close button when dialog opens and enable Escape to close
  useEffect(() => {
    if (dialogOpen) {
      closeButtonRef.current?.focus();
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDialogOpen(false);
        setState("idle");
        setFeedback(null);
        setQuestions([]);
        setCurrentIndex(0);
        onError?.("User cancelled CAPTCHA");
        setLiveMessage("Verification cancelled");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, onError]);

  // Trigger a small enter animation when the dialog opens
  useEffect(() => {
    if (dialogOpen) {
      // ensure initial frame renders before animating in
      const id = requestAnimationFrame(() => setAnimateIn(true));
      return () => cancelAnimationFrame(id);
    }
    setAnimateIn(false);
  }, [dialogOpen]);

  const handleCancel = () => {
    setDialogOpen(false);
    setState("idle");
    setFeedback(null);
    setQuestions([]);
    setCurrentIndex(0);
    onError?.("User cancelled CAPTCHA");
    setLiveMessage("Verification cancelled");
  };

  return (
    <>
      {/* Turnstile-style CAPTCHA */}
      <div className="inline-block rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClick}
              disabled={state === "checking" || state === "success"}
              role="checkbox"
              aria-checked={state === "success"}
              aria-label="I'm not a robot"
              aria-busy={state === "checking"}
              className={`flex h-6 w-6 items-center justify-center rounded border-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                state === "success"
                  ? "border-green-600 bg-green-500 text-white"
                  : "border-gray-400 hover:border-gray-500"
              }`}
            >
              {state === "checking" ? (
                <span
                  aria-hidden
                  className="block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
                />
              ) : (
                getCheckboxState()
              )}
            </button>
            <span className="text-sm text-gray-800">
              {state === "success" ? "Verified" : "I'm not a robot"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-[10px] text-gray-500">
            <span>Protected by</span>
            <span className="font-semibold text-gray-700">Freak-cha</span>
          </div>
        </div>
      </div>

      {/* Verification Dialog */}
      {dialogOpen && questions.length > 0 && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
            animateIn ? "bg-black/50 opacity-100" : "bg-black/0 opacity-0"
          }`}
          aria-hidden={false}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="captcha-dialog-title"
            className={`w-full max-w-6xl transform space-y-5 rounded-2xl bg-white p-8 shadow-lg transition-all duration-200 ${
              animateIn
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-2 scale-95 opacity-0"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 text-center">
                <h2
                  id="captcha-dialog-title"
                  className="text-2xl font-bold text-gray-900"
                >
                  Verify You're Human
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Answer using tongue gestures
                </p>
              </div>
              <button
                ref={closeButtonRef}
                onClick={handleCancel}
                aria-label="Close verification"
                className="ml-4 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {/* Progress */}
            {questions.length > 1 && (
              <div
                className="flex items-center gap-2"
                aria-label="Progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={questions.length}
                aria-valuenow={currentIndex + 1}
              >
                {questions.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full ${
                      i < currentIndex
                        ? "bg-green-500"
                        : i === currentIndex
                          ? "bg-blue-500"
                          : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Question */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-center">
              <div className="mb-4 text-xl font-bold text-gray-900">
                {questions[currentIndex]?.text ?? ""}
              </div>
              <div className="flex justify-center gap-6 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span>Yes = Up/Down</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <span>No = Left/Right</span>
                </div>
              </div>
            </div>

            {/* Video with GestureDetector */}
            <div className="relative overflow-hidden rounded-xl border border-gray-200">
              <div className="relative pb-[56.25%]">
                <div className="absolute inset-0">
                  <GestureDetector
                    onGesture={handleGesture}
                    onDetection={(d, c) => {
                      setLastDetection(d);
                      setLastConfidence(c);
                    }}
                    showDebug={false}
                  />
                </div>
              </div>

              {/* Feedback overlay */}
              {feedback === "correct" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-4 border-green-500 bg-green-500/20 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="mb-2 text-6xl">✓</div>
                    <div className="text-2xl font-bold text-green-600">
                      Correct!
                    </div>
                  </div>
                </div>
              )}

              {feedback === "wrong" && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-4 border-red-500 bg-red-500/20 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="mb-2 text-6xl">✗</div>
                    <div className="text-2xl font-bold text-red-600">
                      Try Again!
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom detections bar */}
            <div className="rounded-lg bg-gray-900 p-4 text-sm text-white">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-400">Detection: </span>
                  <span className="font-mono text-green-400">
                    {lastDetection}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Confidence: </span>
                  <span className="font-mono">
                    {(lastConfidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
            </div>

            {/* Live region for screen readers */}
            <div role="status" aria-live="polite" className="sr-only">
              {liveMessage}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
