import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseServer";

const MODEL_SERVER_URL =
  process.env.MODEL_SERVER_URL || "http://localhost:8000";
const BUFFER_SIZE = 15; // Number of detections to analyze (1.5 seconds)
const STATIC_THRESHOLD = 0.5; // 50% same position = holding (excluding center)
// Tunable thresholds (env-overridable)
const MIN_CONFIDENCE = Number(process.env.GESTURE_MIN_CONFIDENCE ?? 0.6);
const MIN_ACTIVE_FRACTION = Number(
  process.env.GESTURE_MIN_ACTIVE_FRACTION ?? 0.6,
);
const HORIZONTAL_NORM_THRESHOLD = Number(
  process.env.GESTURE_HORIZONTAL_NORM_THRESHOLD ?? 0.85,
);
const VERTICAL_NORM_THRESHOLD = Number(
  process.env.GESTURE_VERTICAL_NORM_THRESHOLD ?? 0.85,
);
const PER_AXIS_MIN_FRAMES = Number(process.env.GESTURE_AXIS_MIN_FRAMES ?? 6);
const MIN_ALTERNATIONS = Number(process.env.GESTURE_MIN_ALTERNATIONS ?? 3);
const MAX_ALTERNATION_GAP_MS = Number(
  process.env.GESTURE_MAX_ALTERNATION_GAP_MS ?? 350,
);
const GAP_RESET_MS = Number(process.env.GESTURE_GAP_RESET_MS ?? 1200);
const COOLDOWN_MS = Number(process.env.GESTURE_COOLDOWN_MS ?? 1200);

// In-memory session storage
interface DetectionFrame {
  detection: string;
  confidence: number;
  timestamp: number;
}

interface UserSession {
  userId: string;
  buffer: DetectionFrame[];
  startTime: number;
  lastGestureAt?: number;
}

const sessions = new Map<string, UserSession>();

// Clean up old sessions (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.startTime < fiveMinutesAgo) {
      sessions.delete(sessionId);
    }
  }
}, 60000); // Run every minute

export async function POST(req: Request) {
  try {
    // Auth check (optional for captcha usage)
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      accessToken = authHeader.slice(7).trim();
    }

    const supabase = createServerSupabaseClient(accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Parse request
    const body = (await req.json().catch(() => null)) as {
      image?: string;
      sessionId?: string;
    } | null;
    if (!body?.image || typeof body.image !== "string") {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }

    // Generate session ID (use user ID if authenticated, otherwise use client-provided sessionId)
    const sessionId =
      user?.id ??
      body.sessionId ??
      `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Call YOLO model
    const response = await fetch(`${MODEL_SERVER_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: body.image }),
    });

    if (!response.ok) {
      throw new Error(`Model server error: ${response.status}`);
    }

    const result = await response.json();

    // Get or create user session
    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        userId: sessionId,
        buffer: [],
        startTime: Date.now(),
      };
      sessions.set(sessionId, session);
    }

    // Reset buffer if there was a long inactivity gap
    const now = Date.now();
    if (session.buffer.length > 0) {
      const lastFrame = session.buffer[session.buffer.length - 1];
      if (lastFrame) {
        const lastTimestamp = lastFrame.timestamp;
        if (now - lastTimestamp > GAP_RESET_MS) {
          session.buffer = [];
          session.startTime = now;
        }
      }
    }

    // Add detection to buffer
    session.buffer.push({
      detection: result.detection,
      confidence: result.confidence,
      timestamp: now,
    });

    // Keep buffer at max size
    if (session.buffer.length > BUFFER_SIZE) {
      session.buffer.shift();
    }

    // Analyze if we have enough data
    let gesture = null;
    let gestureConfidence = 0;
    let distribution = {};

    if (session.buffer.length >= BUFFER_SIZE) {
      const analysis = analyzeGesture(session.buffer);
      gesture = analysis.gesture;
      gestureConfidence = analysis.confidence;
      distribution = analysis.distribution;

      // Gesture cooldown to avoid instant re-triggers
      if (gesture) {
        if (
          session.lastGestureAt &&
          now - session.lastGestureAt < COOLDOWN_MS
        ) {
          gesture = null;
          gestureConfidence = 0;
        } else {
          session.lastGestureAt = now;
        }
      }
    }

    return NextResponse.json({
      detection: result.detection,
      confidence: result.confidence,
      bufferSize: session.buffer.length,
      bufferFull: session.buffer.length >= BUFFER_SIZE,
      gesture,
      gestureConfidence,
      distribution,
      timestamp: Date.now(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Reset user's buffer
export async function DELETE(req: Request) {
  try {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      accessToken = authHeader.slice(7).trim();
    }

    const supabase = createServerSupabaseClient(accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Generate session ID (use user ID if authenticated, otherwise can't delete)
    const sessionId = user?.id;

    if (sessionId) {
      sessions.delete(sessionId);
    }

    return NextResponse.json({ success: true, message: "Buffer cleared" });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Analyze gesture from buffer
function analyzeGesture(buffer: DetectionFrame[]): {
  gesture: string | null;
  confidence: number;
  distribution: Record<string, number>;
} {
  // Filter frames by minimum confidence
  const filtered = buffer.filter((f) => f.confidence >= MIN_CONFIDENCE);
  const total = filtered.length;

  // Not enough confident data to analyze
  if (total === 0) {
    return { gesture: null, confidence: 0, distribution: {} };
  }

  // Absolute counts over filtered frames
  let countLeft = 0,
    countRight = 0,
    countUp = 0,
    countDown = 0,
    countCenter = 0;
  for (const frame of filtered) {
    switch (frame.detection) {
      case "tongue_left":
        countLeft++;
        break;
      case "tongue_right":
        countRight++;
        break;
      case "tongue_up":
        countUp++;
        break;
      case "tongue_down":
        countDown++;
        break;
      case "tongue_center":
        countCenter++;
        break;
      default:
        break;
    }
  }

  // Distribution over all filtered frames
  const distribution: Record<string, number> = {
    tongue_left: countLeft / total,
    tongue_right: countRight / total,
    tongue_up: countUp / total,
    tongue_down: countDown / total,
    tongue_center: countCenter / total,
  };

  // Active fraction requirement (exclude center/no_tongue)
  const activeCount = countLeft + countRight + countUp + countDown;
  const activeFraction = activeCount / total;
  if (activeFraction < MIN_ACTIVE_FRACTION) {
    return { gesture: null, confidence: 0, distribution };
  }

  // Normalize relative to active counts
  const leftNorm = activeCount > 0 ? countLeft / activeCount : 0;
  const rightNorm = activeCount > 0 ? countRight / activeCount : 0;
  const upNorm = activeCount > 0 ? countUp / activeCount : 0;
  const downNorm = activeCount > 0 ? countDown / activeCount : 0;

  // STATIC GESTURES (one position dominates - 50%+ of active detections)
  if (leftNorm > STATIC_THRESHOLD) {
    return { gesture: "hold_left", confidence: leftNorm, distribution };
  }
  if (rightNorm > STATIC_THRESHOLD) {
    return { gesture: "hold_right", confidence: rightNorm, distribution };
  }
  if (upNorm > STATIC_THRESHOLD) {
    return { gesture: "hold_up", confidence: upNorm, distribution };
  }
  if (downNorm > STATIC_THRESHOLD) {
    return { gesture: "hold_down", confidence: downNorm, distribution };
  }

  // AGGRESSIVE HORIZONTAL MOVEMENT (rapid left <-> right)
  const horizontalNorm = leftNorm + rightNorm;
  const horizontalCount = countLeft + countRight;
  if (
    horizontalNorm >= HORIZONTAL_NORM_THRESHOLD &&
    leftNorm > 0.3 &&
    rightNorm > 0.3 &&
    horizontalCount >= PER_AXIS_MIN_FRAMES
  ) {
    const sequence = getSequence(
      buffer.filter((f) => f.confidence >= MIN_CONFIDENCE),
    );
    if (isRapidAlternation(sequence, ["tongue_left", "tongue_right"])) {
      return {
        gesture: "shake_horizontal",
        confidence: horizontalNorm,
        distribution,
      };
    }
  }

  // AGGRESSIVE VERTICAL MOVEMENT (rapid up <-> down)
  const verticalNorm = upNorm + downNorm;
  const verticalCount = countUp + countDown;
  if (
    verticalNorm >= VERTICAL_NORM_THRESHOLD &&
    upNorm > 0.3 &&
    downNorm > 0.3 &&
    verticalCount >= PER_AXIS_MIN_FRAMES
  ) {
    const sequence = getSequence(
      buffer.filter((f) => f.confidence >= MIN_CONFIDENCE),
    );
    if (isRapidAlternation(sequence, ["tongue_up", "tongue_down"])) {
      return {
        gesture: "shake_vertical",
        confidence: verticalNorm,
        distribution,
      };
    }
  }

  return { gesture: null, confidence: 0, distribution };
}

// Get unique sequence (remove consecutive duplicates), including timestamps for time-aware checks
function getSequence(
  buffer: DetectionFrame[],
): { detection: string; timestamp: number }[] {
  const sequence: { detection: string; timestamp: number }[] = [];
  for (const frame of buffer) {
    if (frame.detection === "no_tongue") continue;
    const last = sequence[sequence.length - 1];
    if (!last || last.detection !== frame.detection) {
      sequence.push({ detection: frame.detection, timestamp: frame.timestamp });
    }
  }
  return sequence;
}

// Check for rapid back-and-forth movement within a max time gap between alternations
function isRapidAlternation(
  sequence: { detection: string; timestamp: number }[],
  positions: string[],
): boolean {
  let alternations = 0;
  for (let i = 1; i < sequence.length; i++) {
    const current = sequence[i];
    const previous = sequence[i - 1];
    if (!current || !previous) continue;
    if (
      positions.includes(current.detection) &&
      positions.includes(previous.detection) &&
      current.detection !== previous.detection &&
      current.timestamp - previous.timestamp <= MAX_ALTERNATION_GAP_MS
    ) {
      alternations++;
    }
  }
  return alternations >= MIN_ALTERNATIONS;
}
