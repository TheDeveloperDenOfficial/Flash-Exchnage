// app/admin/prices/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db';

interface TokenPrice {
  id: number;
  symbol: string;
  network: string;
  priceUsd: number;
}

export default function ManagePrices() {
  const [prices, setPrices] = useState<TokenPrice[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    const res = await fetch('/api/crypto');
    const data = await res.json();
    setPrices(data);
  };

  const handleSave = async (id: number, newPrice: number) => {
    await fetch(`/api/crypto?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceUsd: newPrice }),
    });
    setEditingId(null);
    fetchPrices();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Manage Token Prices</h1>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Token
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Network
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price (USD)
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {prices.map((price) => (
            <tr key={price.id}>
              <td className="px-6 py-4 whitespace-nowrap">{price.symbol}</td>
              <td className="px-6 py-4 whitespace-nowrap">{price.network}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                {editingId === price.id ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(parseFloat(e.target.value))}
                    className="border rounded px-2 py-1 w-24"
                  />
                ) : (
                  `$${price.priceUsd}`
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {editingId === price.id ? (
                  <button
                    onClick={() => handleSave(price.id, editValue)}
                    className="text-green-600 hover:text-green-900 mr-2"
                  >
                    Save
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(price.id);
                      setEditValue(price.priceUsd);
                    }}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    Edit
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
