// app/api/payments/route.ts

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// Simulate payment detection (mock)
export async function POST(req: NextRequest) {
  const { orderId } = await req.json();

  const order = await db.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    return new Response('Order not found', { status: 404 });
  }

  // Simulate random success/failure
  const isSuccess = Math.random() > 0.3;

  if (isSuccess) {
    await db.order.update({
      where: { id: orderId },
      data: {
        status: 'paid',
        amountPaid: order.amountRequested,
        paidAt: new Date(),
        txHash: '0x' + Math.random().toString(16).substring(2, 34),
      },
    });

    return Response.json({ success: true, message: 'Payment confirmed' });
  } else {
    return new Response('Payment failed or incomplete', { status: 400 });
  }
}
