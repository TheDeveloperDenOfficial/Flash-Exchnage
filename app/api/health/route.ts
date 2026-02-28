// app/api/health/route.ts

export async function GET() {
  return new Response(JSON.stringify({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'flash-exchange'
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
