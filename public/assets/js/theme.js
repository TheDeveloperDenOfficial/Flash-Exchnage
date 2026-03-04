/**
 * Flash Exchange – Frontend API Integration
 * Handles order creation, payment modal, and live status polling.
 * Vanilla JS — no framework dependency.
 */
(function () {
  'use strict';

  var API_BASE = '/api';
  var pollInterval = null;
  var currentOrderId = null;

  // ── Network explorer URLs for tx links ──────────────────
  var EXPLORER = {
    bsc:  'https://bscscan.com/tx/',
    eth:  'https://etherscan.io/tx/',
    tron: 'https://tronscan.org/#/transaction/',
  };

  // ── DOM Ready ────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    attachBuyButton();
    injectModal();
  });

  // ── Buy Button Handler ───────────────────────────────────
  function attachBuyButton() {
    var btn = document.querySelector('.token-buy-form .btn-primary');
    if (!btn) return;

    btn.addEventListener('click', function () {
      handleBuyClick();
    });
  }

  async function handleBuyClick() {
    var qtyInput        = document.getElementById('icox_quantity');
    var usdtInput       = document.getElementById('usdt_amount');
    var paymentMethod   = document.getElementById('payment_method');
    var receivingWallet = document.getElementById('receiving_wallet');

    // Client-side validation
    var qty = parseFloat(qtyInput ? qtyInput.value : 0);
    var usdtRaw = usdtInput ? usdtInput.value.replace(/[^0-9.]/g, '') : '0';
    var usdtAmt = parseFloat(usdtRaw);
    var method  = paymentMethod ? paymentMethod.value : '';
    var wallet  = receivingWallet ? receivingWallet.value.trim() : '';

    if (!qty || qty < 1) {
      return showFormError('Please enter a valid token quantity.');
    }
    if (!usdtAmt || usdtAmt <= 0) {
      return showFormError('Please enter a valid purchase amount.');
    }
    if (!method) {
      return showFormError('Please select a payment method.');
    }
    if (!wallet || wallet.length < 20) {
      return showFormError('Please enter a valid receiving wallet address.');
    }

    clearFormError();
    setBuyButtonLoading(true);

    try {
      var response = await fetch(API_BASE + '/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usdt_amount:      usdtAmt,
          payment_method:   method,
          receiving_wallet: wallet,
        }),
      });

      var data = await response.json();

      if (!response.ok) {
        var errMsg = data.error || 'Order creation failed.';
        if (data.details && Array.isArray(data.details)) {
          errMsg = data.details.join(' • ');
        }
        return showFormError(errMsg);
      }

      currentOrderId = data.orderId;
      showPaymentModal(data);
      startStatusPolling(data.orderId);

    } catch (err) {
      showFormError('Network error. Please check your connection and try again.');
      console.error('[FlashExchange] Order creation error:', err);
    } finally {
      setBuyButtonLoading(false);
    }
  }

  // ── Status Polling ───────────────────────────────────────
  function startStatusPolling(orderId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async function () {
      try {
        var response = await fetch(API_BASE + '/order/' + orderId);
        if (!response.ok) return;
        var data = await response.json();
        updateModalStatus(data);

        // Stop polling on terminal states
        if (['completed', 'failed', 'expired'].includes(data.status)) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (err) {
        console.warn('[FlashExchange] Polling error:', err);
      }
    }, 5000);
  }

  // ── Modal Injection ──────────────────────────────────────
  function injectModal() {
    var html = [
      '<div id="fe-modal-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;',
      'background:rgba(10,10,30,0.88);z-index:9999;overflow-y:auto;backdrop-filter:blur(4px);">',
      '<div style="max-width:520px;margin:40px auto;padding:20px;">',
      '<div id="fe-modal-card" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">',

      // Header
      '<div style="background:linear-gradient(135deg,#38385f,#5c5c9e);padding:24px;color:#fff;">',
      '<div style="display:flex;justify-content:space-between;align-items:center;">',
      '<div>',
      '<h5 style="margin:0;font-size:18px;font-weight:700;">Complete Your Purchase</h5>',
      '<p id="fe-modal-subtitle" style="margin:4px 0 0;font-size:13px;opacity:.75;">Send payment to receive your FLASH tokens</p>',
      '</div>',
      '<button id="fe-modal-close" style="background:rgba(255,255,255,.2);border:none;color:#fff;',
      'width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1;">&times;</button>',
      '</div>',
      '</div>',

      // Status Banner
      '<div id="fe-status-banner" style="padding:10px 24px;font-size:13px;font-weight:600;text-align:center;',
      'background:#fff8e1;color:#7c6a00;">⏳ Awaiting Payment</div>',

      // Body
      '<div style="padding:24px;">',

      // Timer
      '<div style="text-align:center;margin-bottom:20px;">',
      '<span style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Time Remaining</span><br>',
      '<span id="fe-timer" style="font-size:32px;font-weight:700;color:#38385f;font-family:monospace;">30:00</span>',
      '</div>',

      // Amount Box
      '<div style="background:#f8f7ff;border:2px dashed #b0aee0;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">',
      '<p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;">Send Exactly This Amount</p>',
      '<div style="display:flex;align-items:center;justify-content:center;gap:10px;">',
      '<span id="fe-amount" style="font-size:26px;font-weight:800;color:#38385f;font-family:monospace;">-</span>',
      '<span id="fe-coin" style="font-size:16px;font-weight:700;color:#7c7cb0;padding:4px 8px;background:#e8e7ff;border-radius:6px;">BNB</span>',
      '</div>',
      '<button id="fe-copy-amount" style="margin-top:8px;font-size:12px;background:#38385f;color:#fff;',
      'border:none;padding:4px 12px;border-radius:20px;cursor:pointer;">Copy Amount</button>',
      '</div>',

      // Address Box
      '<div style="margin-bottom:16px;">',
      '<p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;">Payment Address</p>',
      '<div style="display:flex;align-items:center;gap:8px;background:#f5f5f5;border-radius:8px;padding:10px 12px;">',
      '<span id="fe-address" style="font-size:12px;font-family:monospace;word-break:break-all;flex:1;color:#333;">-</span>',
      '<button id="fe-copy-addr" style="background:#38385f;color:#fff;border:none;',
      'padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">Copy</button>',
      '</div>',
      '</div>',

      // Info Row
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">',
      '<div style="background:#f8f7ff;border-radius:8px;padding:12px;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;">You Receive</p>',
      '<p id="fe-tokens" style="margin:0;font-size:17px;font-weight:700;color:#38385f;">- FLASH</p>',
      '</div>',
      '<div style="background:#f8f7ff;border-radius:8px;padding:12px;text-align:center;">',
      '<p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;">Order ID</p>',
      '<p id="fe-order-id" style="margin:0;font-size:10px;font-family:monospace;color:#666;word-break:break-all;">-</p>',
      '</div>',
      '</div>',

      // Warning
      '<div style="background:#fff3cd;border-radius:8px;padding:12px;font-size:12px;color:#664d03;margin-bottom:16px;">',
      '⚠️ <strong>Important:</strong> Send the <em>exact</em> amount shown above. The unique decimal is your order fingerprint — a different amount cannot be automatically matched.',
      '</div>',

      // TX hash (shown after completion)
      '<div id="fe-tx-section" style="display:none;background:#d4edda;border-radius:8px;padding:12px;font-size:12px;margin-bottom:16px;">',
      '<p style="margin:0 0 4px;font-weight:700;color:#155724;">✅ Transaction Confirmed</p>',
      '<a id="fe-tx-link" href="#" target="_blank" style="color:#0d6efd;word-break:break-all;font-family:monospace;font-size:11px;">View on Explorer</a>',
      '</div>',

      // Network badge
      '<div style="text-align:center;">',
      '<span id="fe-network-badge" style="font-size:11px;background:#e8e7ff;color:#38385f;',
      'padding:4px 12px;border-radius:20px;font-weight:600;">Network: BSC</span>',
      '</div>',

      '</div>', // /body
      '</div>', // /card
      '</div>', // /inner
      '</div>', // /overlay
    ].join('');

    var container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstChild);

    // Close button
    document.getElementById('fe-modal-close').addEventListener('click', closeModal);
    document.getElementById('fe-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });

    // Copy buttons
    document.getElementById('fe-copy-amount').addEventListener('click', function () {
      var amt = document.getElementById('fe-amount').textContent;
      copyToClipboard(amt, this);
    });
    document.getElementById('fe-copy-addr').addEventListener('click', function () {
      var addr = document.getElementById('fe-address').textContent;
      copyToClipboard(addr, this);
    });
  }

  // ── Show Modal with Order Data ───────────────────────────
  function showPaymentModal(order) {
    document.getElementById('fe-amount').textContent   = order.uniqueCryptoAmount;
    document.getElementById('fe-coin').textContent     = order.coinSymbol;
    document.getElementById('fe-address').textContent  = order.paymentAddress;
    document.getElementById('fe-tokens').textContent   = formatNumber(order.tokenAmount) + ' ' + (order.tokenSymbol || 'FLASH');
    document.getElementById('fe-order-id').textContent = order.orderId;
    document.getElementById('fe-network-badge').textContent = 'Network: ' + order.networkLabel;
    document.getElementById('fe-modal-subtitle').textContent =
      'Send ' + order.coinSymbol + ' on ' + order.networkLabel + ' to receive tokens';

    startTimer(new Date(order.expiresAt));
    setStatus('waiting_payment');

    document.getElementById('fe-modal-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  // ── Update Modal on Status Poll ──────────────────────────
  function updateModalStatus(data) {
    setStatus(data.status);

    // Update timer
    if (data.timeRemaining) {
      document.getElementById('fe-timer').textContent = data.timeRemaining.display;
    }

    // Show outgoing tx hash when completed
    if (data.status === 'completed' && data.txHashOut) {
      var network = data.network || 'bsc';
      var explorerUrl = (EXPLORER[network] || EXPLORER.bsc) + data.txHashOut;
      document.getElementById('fe-tx-section').style.display = 'block';
      var txLink = document.getElementById('fe-tx-link');
      txLink.href = explorerUrl;
      txLink.textContent = data.txHashOut;
    }
  }

  // ── Status Banner ────────────────────────────────────────
  var STATUS_CONFIG = {
    waiting_payment: { text: '⏳ Awaiting Payment', bg: '#fff8e1', color: '#7c6a00' },
    matched:         { text: '🔍 Payment Detected — Sending Tokens…', bg: '#e3f2fd', color: '#0d47a1' },
    sending:         { text: '📤 Sending Tokens to Your Wallet…', bg: '#e8f5e9', color: '#1b5e20' },
    completed:       { text: '✅ Complete! Tokens Sent Successfully', bg: '#d4edda', color: '#155724' },
    expired:         { text: '⏰ Order Expired — Tokens NOT Sent', bg: '#f8d7da', color: '#721c24' },
    failed:          { text: '❌ Send Failed — Please Contact Support', bg: '#f8d7da', color: '#721c24' },
  };

  function setStatus(status) {
    var cfg = STATUS_CONFIG[status] || STATUS_CONFIG.waiting_payment;
    var banner = document.getElementById('fe-status-banner');
    if (!banner) return;
    banner.textContent = cfg.text;
    banner.style.background = cfg.bg;
    banner.style.color = cfg.color;
  }

  // ── Countdown Timer ──────────────────────────────────────
  var timerInterval = null;

  function startTimer(expiresAt) {
    if (timerInterval) clearInterval(timerInterval);

    function tick() {
      var remaining = new Date(expiresAt) - Date.now();
      var timerEl = document.getElementById('fe-timer');
      if (!timerEl) return;

      if (remaining <= 0) {
        timerEl.textContent = '00:00';
        timerEl.style.color = '#dc3545';
        clearInterval(timerInterval);
        return;
      }

      var minutes = Math.floor(remaining / 60000);
      var seconds = Math.floor((remaining % 60000) / 1000);
      timerEl.textContent =
        String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');

      // Color shift as time runs out
      if (remaining < 5 * 60 * 1000) {
        timerEl.style.color = '#dc3545';
      } else if (remaining < 10 * 60 * 1000) {
        timerEl.style.color = '#fd7e14';
      }
    }

    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // ── Helpers ──────────────────────────────────────────────
  function closeModal() {
    var overlay = document.getElementById('fe-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    currentOrderId = null;
    // Re-show tx section as hidden for next order
    var txSec = document.getElementById('fe-tx-section');
    if (txSec) txSec.style.display = 'none';
  }

  function copyToClipboard(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(function () {
          btn.textContent = orig;
          btn.style.background = '';
        }, 1500);
      });
    } else {
      // Fallback for older browsers
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function setBuyButtonLoading(loading) {
    var btn = document.querySelector('.token-buy-form .btn-primary');
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Processing…' : 'Buy Flash Now';
  }

  function showFormError(msg) {
    clearFormError();
    var form = document.querySelector('.token-buy-form');
    if (!form) return;
    var div = document.createElement('div');
    div.id = 'fe-form-error';
    div.style.cssText = 'background:#f8d7da;color:#721c24;padding:10px 14px;border-radius:8px;' +
      'font-size:13px;margin-bottom:12px;';
    div.textContent = '⚠️ ' + msg;
    form.insertBefore(div, form.lastElementChild);
  }

  function clearFormError() {
    var existing = document.getElementById('fe-form-error');
    if (existing) existing.remove();
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

})();
