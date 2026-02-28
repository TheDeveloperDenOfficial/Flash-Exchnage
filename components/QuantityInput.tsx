// components/QuantityInput.tsx

import React from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  pricePerToken: number;
}

export default function QuantityInput({ value, onChange, pricePerToken }: Props) {
  const total = value * pricePerToken;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Number of Tokens
      </label>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-sm text-gray-600">
        Estimated Total: ${total.toFixed(2)}
      </p>
    </div>
  );
}
