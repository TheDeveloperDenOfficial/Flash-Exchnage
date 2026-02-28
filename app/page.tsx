// app/page.tsx

'use client';

import { useState, useEffect } from 'react';
import TokenSelector from '@/components/TokenSelector';
import AddressInput from '@/components/AddressInput';
import QuantityInput from '@/components/QuantityInput';
import PaymentSelector from '@/components/PaymentSelector';
import QRDisplay from '@/components/QRDisplay';
import OrderTracker from '@/components/OrderTracker';
import { getPrice } from '@/lib/pricing';

export default function HomePage() {
  const [selectedToken, setSelectedToken] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pricePerToken, setPricePerToken] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [addressError, setAddressError] = useState('');

  // Load initial price
  useEffect(() => {
    const loadPrice = async () => {
      if (selectedToken) {
        const [token, network] = selectedToken.split('_');
        const price = await getPrice(token, network);
        setPricePerToken(price);
      }
    };
    loadPrice();
  }, [selectedToken]);

  const handleTokenSelect = (token: string) => {
    setSelectedToken(token);
    setUserAddress('');
    setAddressError('');
  };

  const handleAddressChange = (address: string) => {
    setUserAddress(address);
    setAddressError('');
  };

  const handleContinue = async () => {
    if (!selectedToken) {
      alert('Please select a token');
      return;
    }
    
    if (!userAddress) {
      setAddressError('Please enter your wallet address');
      return;
    }
    
    if (quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setLoading(true);
    
    try {
      // Create order
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress,
          chain: selectedToken,
          payToken: selectedPayment || 'USDT',
          amountRequested: quantity,
        }),
      });
      
      const order = await response.json();
      setOrderId(order.id);
      setShowPayment(true);
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showPayment) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-8">Complete Your Payment</h1>
          
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Order Details</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Order ID:</span>
                  <span className="ml-2 font-mono">{orderId}</span>
                </div>
                <div>
                  <span className="text-gray-600">Amount:</span>
                  <span className="ml-2">{quantity} tokens</span>
                </div>
                <div>
                  <span className="text-gray-600">Total Cost:</span>
                  <span className="ml-2">${(quantity * pricePerToken).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Token:</span>
                  <span className="ml-2">{selectedToken.replace('_', ' ')}</span>
                </div>
              </div>
            </div>

            {!selectedPayment ? (
              <div>
                <h3 className="text-lg font-medium mb-4">Select Payment Method</h3>
                <PaymentSelector 
                  selected={selectedPayment} 
                  onChange={setSelectedPayment} 
                />
                <button
                  onClick={handleContinue}
                  disabled={!selectedPayment || loading}
                  className="mt-4 w-full py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Processing...' : 'Generate Payment QR'}
                </button>
              </div>
            ) : (
              <div>
                <h3 className="text-lg font-medium mb-4">Pay with {selectedPayment}</h3>
                <QRDisplay 
                  token={selectedPayment.split('_')[0]}
                  network={selectedPayment.split('_')[1] || selectedPayment}
                  amount={quantity * pricePerToken}
                  orderId={orderId}
                />
                <div className="mt-6 text-center">
                  <p className="text-gray-600 mb-4">
                    Scan the QR code or copy the address to complete your payment
                  </p>
                  <div className="animate-pulse flex items-center justify-center">
                    <div className="h-3 w-3 bg-blue-500 rounded-full mr-2"></div>
                    <span className="text-blue-600">Waiting for payment confirmation...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                setShowPayment(false);
                setSelectedPayment('');
              }}
              className="text-blue-600 hover:text-blue-800 underline"
            >
              ← Back to token selection
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Flash Exchange</h1>
        <p className="text-xl text-gray-600">
          Instantly buy and sell cryptocurrencies
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Token Selection */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Select Token & Network</h2>
          <TokenSelector 
            selected={selectedToken} 
            onChange={handleTokenSelect} 
          />
        </div>

        {/* Address Input */}
        {selectedToken && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Your Wallet Address</h2>
            <AddressInput 
              chain={selectedToken}
              value={userAddress}
              onChange={handleAddressChange}
              error={addressError}
            />
          </div>
        )}

        {/* Quantity Input */}
        {selectedToken && userAddress && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">Enter Quantity</h2>
            <QuantityInput 
              value={quantity}
              onChange={setQuantity}
              pricePerToken={pricePerToken}
            />
          </div>
        )}

        {/* Continue Button */}
        {selectedToken && userAddress && quantity > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
              <div>
                <span className="text-gray-600">Total Cost:</span>
                <span className="ml-2 text-xl font-bold">
                  ${(quantity * pricePerToken).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleContinue}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? 'Processing...' : 'Continue to Payment'}
              </button>
            </div>
          </div>
        )}

        {/* Order Tracker */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4">Track Your Order</h2>
          <OrderTracker />
        </div>
      </div>
    </div>
  );
}
