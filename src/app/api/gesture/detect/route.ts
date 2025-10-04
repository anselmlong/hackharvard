import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

const MODEL_SERVER_URL = process.env.MODEL_SERVER_URL || 'http://localhost:8000';
const BUFFER_SIZE = 20; // Number of detections to analyze
const STATIC_THRESHOLD = 0.8; // 80% same position = holding
const BALANCED_THRESHOLD = 0.35; // 35/65 split = movement

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
    // Auth check (same pattern as existing routes)
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }

    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse request
    const body = await req.json().catch(() => null) as { image?: string } | null;
    if (!body?.image || typeof body.image !== 'string') {
      return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
    }

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
    let session = sessions.get(user.id);
    if (!session) {
      session = {
        userId: user.id,
        buffer: [],
        startTime: Date.now()
      };
      sessions.set(user.id, session);
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

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    sessions.delete(user.id);

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

  // STATIC GESTURES (one position dominates)
  if (leftPct > STATIC_THRESHOLD) {
    return { gesture: 'hold_left', confidence: leftPct, distribution };
  }
  if (rightPct > STATIC_THRESHOLD) {
    return { gesture: 'hold_right', confidence: rightPct, distribution };
  }
  if (upPct > STATIC_THRESHOLD) {
    return { gesture: 'hold_up', confidence: upPct, distribution };
  }
  if (downPct > STATIC_THRESHOLD) {
    return { gesture: 'hold_down', confidence: downPct, distribution };
  }

  // HORIZONTAL MOVEMENT (left ↔ right)
  const horizontalTotal = leftPct + rightPct;
  if (horizontalTotal > 0.7) {
    const balance = Math.min(leftPct, rightPct) / Math.max(leftPct, rightPct);
    if (balance > BALANCED_THRESHOLD) {
      // Check sequence for direction
      const sequence = getSequence(buffer);
      const firstH = sequence.find(d => d === 'tongue_left' || d === 'tongue_right');
      const lastH = [...sequence].reverse().find(d => d === 'tongue_left' || d === 'tongue_right');

      if (firstH === 'tongue_left' && lastH === 'tongue_right') {
        return { gesture: 'swipe_left_right', confidence: balance, distribution };
      }
      if (firstH === 'tongue_right' && lastH === 'tongue_left') {
        return { gesture: 'swipe_right_left', confidence: balance, distribution };
      }

      // Rapid alternation = shake
      if (isRapidAlternation(sequence, ['tongue_left', 'tongue_right'])) {
        return { gesture: 'shake_horizontal', confidence: balance, distribution };
      }
    }
  }

  // VERTICAL MOVEMENT (up ↔ down)
  const verticalTotal = upPct + downPct;
  if (verticalTotal > 0.7) {
    const balance = Math.min(upPct, downPct) / Math.max(upPct, downPct);
    if (balance > BALANCED_THRESHOLD) {
      const sequence = getSequence(buffer);
      const firstV = sequence.find(d => d === 'tongue_up' || d === 'tongue_down');
      const lastV = [...sequence].reverse().find(d => d === 'tongue_up' || d === 'tongue_down');

      if (firstV === 'tongue_up' && lastV === 'tongue_down') {
        return { gesture: 'flick_up_down', confidence: balance, distribution };
      }
      if (firstV === 'tongue_down' && lastV === 'tongue_up') {
        return { gesture: 'flick_down_up', confidence: balance, distribution };
      }

      if (isRapidAlternation(sequence, ['tongue_up', 'tongue_down'])) {
        return { gesture: 'shake_vertical', confidence: balance, distribution };
      }
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
    if (positions.includes(sequence[i]) &&
        positions.includes(sequence[i - 1]) &&
        sequence[i] !== sequence[i - 1]) {
      alternations++;
    }
  }
  return alternations >= 3;
}
