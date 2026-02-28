// app/api/health/route.ts

export async function GET() {
  return Response.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'flash-exchange'
  });
}
