// app/api/orders/route.ts

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { generateOrderId } from '@/lib/utils';

export async function GET() {
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return Response.json(orders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const orderId = generateOrderId();

  const order = await db.order.create({
    data: {
      id: orderId,
      ...body,
    },
  });

  return Response.json(order);
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Missing order ID', { status: 400 });
  }

  const body = await req.json();

  const updated = await db.order.update({
    where: { id },
    data: body,
  });

  return Response.json(updated);
}
