// app/api/wallet-addresses/route.ts

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/auth';

// GET: Fetch wallet addresses
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const network = searchParams.get('network');
  const activeOnly = searchParams.get('active') !== 'false';

  const where: any = {};
  if (token) where.token = token;
  if (network) where.network = network;
  if (activeOnly) where.isActive = true;

  const addresses = await db.walletAddress.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return Response.json(addresses);
}

// POST: Create new wallet address (admin only)
export async function POST(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();

  const newAddress = await db.walletAddress.create({
    data: body,
  });

  return Response.json(newAddress);
}

// PUT: Update wallet address (admin only)
export async function PUT(req: NextRequest) {
  if (!isAdminAuthenticated(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') || '');

  if (!id || isNaN(id)) {
    return new Response('Invalid ID', { status: 400 });
  }

  const body = await req.json();

  const updated = await db.walletAddress.update({
    where: { id },
    data: body,
  });

  return Response.json(updated);
}
