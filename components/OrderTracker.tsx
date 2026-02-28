// components/OrderTracker.tsx

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderTracker() {
  const router = useRouter();
  const [orderId, setOrderId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderId.trim()) {
      router.push(`/track/${orderId}`);
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="font-semibold">Track Your Order</h2>
      <form onSubmit={handleSubmit} className="mt-2 flex space-x-2">
        <input
          type="text"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Enter Order ID"
          className="flex-1 px-3 py-2 border rounded-md"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Go
        </button>
      </form>
    </div>
  );
}
