// components/QRDisplay.tsx (updated)

'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode.react';

interface Props {
  token: string;
  network: string;
  amount?: number;
  orderId?: string;
}

export default function QRDisplay({ token, network, amount, orderId }: Props) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAddress = async () => {
      try {
        const res = await fetch(`/api/wallet-addresses?token=${token}&network=${network}&active=true`);
        const data = await res.json();
        if (data.length > 0) {
          setAddress(data[0].address);
        }
      } catch (error) {
        console.error('Failed to fetch wallet address:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAddress();
  }, [token, network]);

  if (loading) {
    return (
      <div className="flex flex-col items-center space-y-4 p-4 border rounded-lg bg-white shadow">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p>Loading payment details...</p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center space-y-4 p-4 border rounded-lg bg-white shadow">
        <p className="text-red-500">Wallet address not configured for {token} ({network})</p>
      </div>
    );
  }

  // Format URI depending on chain
  let uri = '';
  if (address.startsWith('T')) {
    uri = `tron:${address}`;
    if (orderId) uri += `?memo=${orderId}`;
  } else if (address.startsWith('0x')) {
    uri = `ethereum:${address}`;
    if (amount) uri += `?value=${amount * 1e18}`;
    if (orderId) uri += `${amount ? '&' : '?'}memo=${orderId}`;
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-4 border rounded-lg bg-white shadow">
      <QRCode value={uri || address} size={200} />
      <div className="text-center">
        <p className="text-sm text-gray-600 break-all">{address}</p>
        <button
          onClick={() => navigator.clipboard.writeText(address)}
          className="mt-2 text-blue-500 underline"
        >
          Copy Address
        </button>
        {orderId && (
          <p className="mt-2 text-xs text-gray-500">
            Memo/Note: {orderId}
          </p>
        )}
      </div>
    </div>
  );
}
