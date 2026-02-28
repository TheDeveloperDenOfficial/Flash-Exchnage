// app/track/[orderId]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Order {
  id: string;
  userAddress: string;
  chain: string;
  payToken: string;
  amountRequested: number;
  amountPaid: number | null;
  txHash: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export default function TrackOrderPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) {
          throw new Error('Order not found');
        }
        const data = await res.json();
        setOrder(data);
      } catch (err) {
        setError('Failed to load order details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow max-w-md w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-6">
            We couldn't find an order with ID: <strong>{orderId}</strong>
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
          >
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Order Details</h1>
          <p className="text-gray-600">Order ID: {order.id}</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Status:</span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                order.status === 'paid'
                  ? 'bg-green-100 text-green-800'
                  : order.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
          </div>

          {/* Order Info */}
          <div className="space-y-4">
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Created:</span>
              <span>{new Date(order.createdAt).toLocaleString()}</span>
            </div>

            {order.paidAt && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Paid At:</span>
                <span>{new Date(order.paidAt).toLocaleString()}</span>
              </div>
            )}

            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Network:</span>
              <span>{order.chain}</span>
            </div>

            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Payment Token:</span>
              <span>{order.payToken}</span>
            </div>

            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-600">Amount Requested:</span>
              <span>{order.amountRequested} tokens</span>
            </div>

            {order.amountPaid !== null && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Amount Paid:</span>
                <span>{order.amountPaid} tokens</span>
              </div>
            )}

            {order.txHash && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Transaction Hash:</span>
                <span className="text-sm break-all text-blue-600">
                  {order.txHash}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <a
              href="/"
              className="flex-1 text-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition"
            >
              Back to Home
            </a>
            {order.status === 'pending' && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/payments', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ orderId: order.id }),
                    });
                    if (res.ok) {
                      window.location.reload();
                    }
                  } catch (err) {
                    console.error('Payment simulation failed:', err);
                  }
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition"
              >
                Simulate Payment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
