import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const startTime = Date.now();

export async function GET() {
  try {
    const supabase = createAdminClient();
    const dbStart = Date.now();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    const dbLatency = Date.now() - dbStart;

    if (error) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        environment: process.env.RAILWAY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'unknown',
        db_latency_ms: dbLatency,
        version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: 'Database connection failed',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
