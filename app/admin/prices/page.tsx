// app/admin/prices/page.tsx (updated)

'use client';

import { useEffect, useState } from 'react';
import PriceEditor from '@/components/Admin/PriceEditor';
import WalletAddressManager from '@/components/Admin/WalletAddressManager';

interface TokenPrice {
  id: number;
  symbol: string;
  network: string;
  priceUsd: number;
}

export default function ManagePrices() {
  const [prices, setPrices] = useState<TokenPrice[]>([]);
  const [activeTab, setActiveTab] = useState<'prices' | 'wallets'>('prices');

  useEffect(() => {
    fetchPrices();
  }, []);

  const fetchPrices = async () => {
    const res = await fetch('/api/crypto');
    const data = await res.json();
    setPrices(data);
  };

  const handlePriceUpdate = async (id: number, newPrice: number) => {
    await fetch(`/api/crypto?id=${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceUsd: newPrice }),
    });
    fetchPrices();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Manage Settings</h1>
      
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('prices')}
            className={`${
              activeTab === 'prices'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium`}
          >
            Token Prices
          </button>
          <button
            onClick={() => setActiveTab('wallets')}
            className={`${
              activeTab === 'wallets'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium`}
          >
            Wallet Addresses
          </button>
        </nav>
      </div>

      {activeTab === 'prices' ? (
        <PriceEditor prices={prices} onUpdate={handlePriceUpdate} />
      ) : (
        <WalletAddressManager />
      )}
    </div>
  );
}
