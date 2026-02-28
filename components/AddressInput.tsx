// components/AddressInput.tsx

import React, { useState } from 'react';

interface Props {
  chain: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export default function AddressInput({ chain, value, onChange, error }: Props) {
  const [localError, setLocalError] = useState('');

  const validate = (addr: string) => {
    let isValid = true;
    let msg = '';

    switch (chain) {
      case 'USDT_TRC20':
        if (!addr.startsWith('T') || addr.length !== 34) {
          isValid = false;
          msg = 'Invalid TRON address';
        }
        break;
      case 'USDT_BEP20':
      case 'USDT_ERC20':
      case 'ETH':
      case 'BNB':
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
          isValid = false;
          msg = 'Invalid Ethereum-style address';
        }
        break;
      default:
        isValid = false;
        msg = 'Unsupported chain';
    }

    setLocalError(msg);
    return isValid;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    onChange(val);
    validate(val);
  };

  return (
    <div className="space-y-1">
      <label htmlFor="address" className="block text-sm font-medium text-gray-700">
        Your Wallet Address ({chain})
      </label>
      <input
        id="address"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={`Enter ${chain} address`}
        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {(error || localError) && (
        <p className="text-red-500 text-xs">{error || localError}</p>
      )}
    </div>
  );
}
