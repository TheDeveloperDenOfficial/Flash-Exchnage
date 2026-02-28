// components/QRDisplay.tsx

import React from 'react';
import QRCode from 'qrcode.react';

interface Props {
  address: string;
  amount?: number;
  memo?: string;
}

export default function QRDisplay({ address, amount, memo }: Props) {
  // Format URI depending on chain (basic version)
  let uri = '';
  if (address.startsWith('T')) {
    uri = `tron:${address}`;
    if (memo) uri += `?memo=${memo}`;
  } else if (address.startsWith('0x')) {
    uri = `ethereum:${address}`;
    if (amount) uri += `?value=${amount * 1e18}`; // assuming ETH-like decimals
    if (memo) uri += `${amount ? '&' : '?'}memo=${memo}`;
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
      </div>
    </div>
  );
}
