'use client';
import { useState, useEffect } from 'react';

const TOKENS = [
  { value: 'BTC_BTC', label: 'Bitcoin (BTC)' },
  { value: 'ETH_ERC20', label: 'Ethereum (ETH - ERC20)' },
  { value: 'USDT_TRC20', label: 'Tether (USDT - TRC20)' },
  { value: 'USDT_ERC20', label: 'Tether (USDT - ERC20)' },
  { value: 'BNB_BEP20', label: 'BNB (BEP20)' },
];

const PAYMENT_METHODS = [
  { value: 'USDT_TRC20', label: 'USDT (TRC20)' },
  { value: 'USDT_ERC20', label: 'USDT (ERC20)' },
  { value: 'BTC_BTC', label: 'Bitcoin (BTC)' },
  { value: 'ETH_ERC20', label: 'Ethereum (ETH)' },
];

type Step = 'select' | 'payment' | 'confirm';

export default function ExchangeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('select');
  const [selectedToken, setSelectedToken] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pricePerToken, setPricePerToken] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState('');
  const [orderId, setOrderId] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      if (!selectedToken) return;
      try {
        const res = await fetch('/api/crypto');
        const prices = await res.json();
        const [token, network] = selectedToken.split('_');
        const match = prices.find((p: { symbol: string; network: string; priceUsd: number }) =>
          p.symbol === token && p.network === network
        );
        if (match) setPricePerToken(match.priceUsd);
      } catch {}
    };
    fetchPrice();
  }, [selectedToken]);

  const handleCreateOrder = async () => {
    if (!selectedToken || !userAddress || !selectedPayment) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          chain: selectedToken,
          payToken: selectedPayment,
          amountRequested: quantity,
        }),
      });
      const order = await res.json();
      setOrderId(order.id);

      // Fetch wallet address for payment
      const walletRes = await fetch(`/api/wallet-addresses?token=${selectedPayment.split('_')[0]}&network=${selectedPayment.split('_')[1] || selectedPayment}`);
      if (walletRes.ok) {
        const w = await walletRes.json();
        setWalletAddress(w.address || '');
      }
      setStep('confirm');
    } catch {
      setError('Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="bg-theme tc-light"
        style={{
          width: '100%', maxWidth: 520, borderRadius: 12,
          padding: 32, position: 'relative',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', color: 'inherit',
            fontSize: 20, cursor: 'pointer', opacity: 0.7,
          }}
        >✕</button>

        <h4 className="title" style={{ marginBottom: 8 }}>
          {step === 'select' && 'Buy Tokens'}
          {step === 'payment' && 'Payment Method'}
          {step === 'confirm' && 'Complete Payment'}
        </h4>
        <p style={{ opacity: 0.6, marginBottom: 24, fontSize: '0.9rem' }}>
          {step === 'select' && 'Select the token you want to buy'}
          {step === 'payment' && 'Choose how you want to pay'}
          {step === 'confirm' && `Order #${orderId} created`}
        </p>

        {error && (
          <div style={{ background: '#f42f5422', border: '1px solid #f42f54', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#f42f54', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {step === 'select' && (
          <div>
            <div className="field-item">
              <label className="field-label ttu">Token to Receive</label>
              <div className="field-wrap">
                <select
                  className="input-bordered"
                  value={selectedToken}
                  onChange={e => setSelectedToken(e.target.value)}
                  style={{ width: '100%', background: 'transparent', color: 'inherit' }}
                >
                  <option value="">Select a token...</option>
                  {TOKENS.map(t => (
                    <option key={t.value} value={t.value} style={{ background: '#1a2a4a' }}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedToken && (
              <>
                <div className="field-item">
                  <label className="field-label ttu">Your Wallet Address</label>
                  <div className="field-wrap">
                    <input
                      type="text"
                      className="input-bordered"
                      placeholder="Enter your wallet address"
                      value={userAddress}
                      onChange={e => setUserAddress(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field-item">
                  <label className="field-label ttu">Quantity</label>
                  <div className="field-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="number"
                      className="input-bordered"
                      min={1}
                      value={quantity}
                      onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ maxWidth: 120 }}
                    />
                    <span style={{ opacity: 0.7 }}>
                      ≈ <strong>${(quantity * pricePerToken).toFixed(2)} USD</strong>
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-round btn-block btn-md"
                  onClick={() => setStep('payment')}
                  disabled={!userAddress}
                  style={{ width: '100%', marginTop: 8 }}
                >
                  Continue →
                </button>
              </>
            )}
          </div>
        )}

        {step === 'payment' && (
          <div>
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ opacity: 0.6 }}>Token:</span>
                <span>{selectedToken.replace('_', ' / ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ opacity: 0.6 }}>Quantity:</span>
                <span>{quantity}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Total:</span>
                <span className="tc-primary" style={{ fontWeight: 700 }}>${(quantity * pricePerToken).toFixed(2)} USD</span>
              </div>
            </div>

            {PAYMENT_METHODS.map(pm => (
              <div
                key={pm.value}
                onClick={() => setSelectedPayment(pm.value)}
                style={{
                  padding: '14px 16px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                  border: `2px solid ${selectedPayment === pm.value ? '#f42f54' : 'rgba(255,255,255,0.1)'}`,
                  background: selectedPayment === pm.value ? 'rgba(244,47,84,0.1)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{pm.label}</span>
                  {selectedPayment === pm.value && <span style={{ color: '#f42f54' }}>✓</span>}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="btn btn-outline btn-round" onClick={() => setStep('select')} style={{ flex: 1 }}>
                ← Back
              </button>
              <button
                className="btn btn-primary btn-round"
                onClick={handleCreateOrder}
                disabled={!selectedPayment || loading}
                style={{ flex: 2 }}
              >
                {loading ? 'Creating Order...' : 'Create Order'}
              </button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', textAlign: 'left', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ opacity: 0.6 }}>Order ID:</span>
                <span style={{ fontFamily: 'monospace', color: '#f42f54' }}>{orderId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ opacity: 0.6 }}>Pay with:</span>
                <span>{selectedPayment.replace('_', ' / ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Amount:</span>
                <span style={{ fontWeight: 700 }}>${(quantity * pricePerToken).toFixed(2)} USD</span>
              </div>
            </div>

            {walletAddress && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ opacity: 0.7, marginBottom: 8, fontSize: '0.875rem' }}>Send payment to this address:</p>
                <div style={{
                  background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 14px',
                  fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all',
                  border: '1px solid rgba(255,255,255,0.1)', marginBottom: 8,
                }}>
                  {walletAddress}
                </div>
                <button className="btn btn-outline btn-round btn-sm" onClick={handleCopy}>
                  {copied ? '✓ Copied!' : 'Copy Address'}
                </button>
              </div>
            )}

            <div style={{ opacity: 0.7, fontSize: '0.8rem', marginBottom: 20 }}>
              After sending payment, track your order using Order ID above at <strong>/track/{orderId}</strong>
            </div>

            <button className="btn btn-primary btn-round" onClick={onClose} style={{ width: '100%' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
