import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

const MODEL_SERVER_URL = process.env.MODEL_SERVER_URL || 'http://localhost:8000';
const BUFFER_SIZE = 15; // Number of detections to analyze (1.5 seconds)
const STATIC_THRESHOLD = 0.5; // 50% same position = holding (excluding center)
const MOVEMENT_THRESHOLD = 0.4; // 40% combined positions = movement
const MIN_ALTERNATIONS = 2; // Minimum switches for shake gesture

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
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }

    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();

    // Parse request
    const body = await req.json().catch(() => null) as { image?: string; sessionId?: string } | null;
    if (!body?.image || typeof body.image !== 'string') {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
    }

    // Generate session ID (use user ID if authenticated, otherwise use client-provided sessionId)
    const sessionId = user?.id ?? body.sessionId ?? `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Call YOLO model
    const response = await fetch(`${MODEL_SERVER_URL}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: body.image })
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
        startTime: Date.now()
      };
      sessions.set(sessionId, session);
    }

    // Add detection to buffer
    session.buffer.push({
      detection: result.detection,
      confidence: result.confidence,
      timestamp: Date.now()
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
    }

    return NextResponse.json({
      detection: result.detection,
      confidence: result.confidence,
      bufferSize: session.buffer.length,
      bufferFull: session.buffer.length >= BUFFER_SIZE,
      gesture,
      gestureConfidence,
      distribution,
      timestamp: Date.now()
    });

  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Reset user's buffer
export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }

    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();

    // Generate session ID (use user ID if authenticated, otherwise can't delete)
    const sessionId = user?.id;

    if (sessionId) {
      sessions.delete(sessionId);
    }

    return NextResponse.json({ success: true, message: 'Buffer cleared' });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Analyze gesture from buffer
function analyzeGesture(buffer: DetectionFrame[]): {
  gesture: string | null;
  confidence: number;
  distribution: Record<string, number>;
} {
  // Calculate distribution
  const counts: Record<string, number> = {};
  for (const frame of buffer) {
    counts[frame.detection] = (counts[frame.detection] || 0) + 1;
  }

  const distribution: Record<string, number> = {};
  for (const [detection, count] of Object.entries(counts)) {
    distribution[detection] = count / buffer.length;
  }

  const leftPct = distribution['tongue_left'] || 0;
  const rightPct = distribution['tongue_right'] || 0;
  const upPct = distribution['tongue_up'] || 0;
  const downPct = distribution['tongue_down'] || 0;
  const centerPct = distribution['tongue_center'] || 0;

  // Calculate percentages excluding center/no_tongue for better detection
  const activeTotal = leftPct + rightPct + upPct + downPct;

  // Only analyze if we have enough active tongue detections (not just center)
  if (activeTotal < 0.3) {
    return { gesture: null, confidence: 0, distribution };
  }

  // Normalize percentages relative to active detections
  const leftNorm = activeTotal > 0 ? leftPct / activeTotal : 0;
  const rightNorm = activeTotal > 0 ? rightPct / activeTotal : 0;
  const upNorm = activeTotal > 0 ? upPct / activeTotal : 0;
  const downNorm = activeTotal > 0 ? downPct / activeTotal : 0;

  // STATIC GESTURES (one position dominates - 50%+ of active detections)
  if (leftNorm > STATIC_THRESHOLD) {
    return { gesture: 'hold_left', confidence: leftNorm, distribution };
  }
  if (rightNorm > STATIC_THRESHOLD) {
    return { gesture: 'hold_right', confidence: rightNorm, distribution };
  }
  if (upNorm > STATIC_THRESHOLD) {
    return { gesture: 'hold_up', confidence: upNorm, distribution };
  }
  if (downNorm > STATIC_THRESHOLD) {
    return { gesture: 'hold_down', confidence: downNorm, distribution };
  }

  // AGGRESSIVE HORIZONTAL MOVEMENT (rapid left <-> right)
  const horizontalNorm = leftNorm + rightNorm;
  if (horizontalNorm > 0.7 && leftNorm > 0.2 && rightNorm > 0.2) {
    const sequence = getSequence(buffer);
    if (isRapidAlternation(sequence, ['tongue_left', 'tongue_right'])) {
      return { gesture: 'shake_horizontal', confidence: horizontalNorm, distribution };
    }
  }

  // AGGRESSIVE VERTICAL MOVEMENT (rapid up <-> down)
  const verticalNorm = upNorm + downNorm;
  if (verticalNorm > 0.7 && upNorm > 0.2 && downNorm > 0.2) {
    const sequence = getSequence(buffer);
    if (isRapidAlternation(sequence, ['tongue_up', 'tongue_down'])) {
      return { gesture: 'shake_vertical', confidence: verticalNorm, distribution };
    }
  }

  return { gesture: null, confidence: 0, distribution };
}

// Get unique sequence (remove consecutive duplicates)
function getSequence(buffer: DetectionFrame[]): string[] {
  const sequence: string[] = [];
  for (const frame of buffer) {
    if (frame.detection === 'no_tongue') continue;
    if (sequence.length === 0 || sequence[sequence.length - 1] !== frame.detection) {
      sequence.push(frame.detection);
    }
  }
  return sequence;
}

// Check for rapid back-and-forth movement
function isRapidAlternation(sequence: string[], positions: string[]): boolean {
  let alternations = 0;
  for (let i = 1; i < sequence.length; i++) {
    const current = sequence[i];
    const previous = sequence[i - 1];
    if (current && previous &&
        positions.includes(current) &&
        positions.includes(previous) &&
        current !== previous) {
      alternations++;
    }
  }
  return alternations >= MIN_ALTERNATIONS;
}
