// components/TokenSelector.tsx

import React from 'react';

interface TokenOption {
  label: string;
  value: string;
}

const TOKEN_OPTIONS: TokenOption[] = [
  { label: 'USDT (TRC20)', value: 'USDT_TRC20' },
  { label: 'USDT (BEP20)', value: 'USDT_BEP20' },
  { label: 'USDT (ERC20)', value: 'USDT_ERC20' },
  { label: 'ETH', value: 'ETH' },
  { label: 'BNB', value: 'BNB' },
];

interface Props {
  selected: string;
  onChange: (value: string) => void;
}

export default function TokenSelector({ selected, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Select Token & Network
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {TOKEN_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 border rounded-md ${
              selected === option.value
                ? 'bg-blue-500 text-white'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
