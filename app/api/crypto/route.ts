// app/api/crypto/route.ts

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/auth';

export async function GET() {
  const prices = await db.tokenPrice.findMany();
  return Response.json(prices);
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '');
  const { priceUsd } = await req.json();

  if (!id || isNaN(id)) {
    return new Response('Invalid ID', { status: 400 });
  }

  const updated = await db.tokenPrice.update({
    where: { id },
    data: { priceUsd },
  });

  return Response.json(updated);
}
