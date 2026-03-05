/**
 * Flash Exchange — Frontend Logic v2.0
 * Handles: config load, dynamic form, buy flow, modal, localStorage recovery, wallet lookup
 */
(function () {
  'use strict';

  var API    = '/api';
  var LS_KEY = 'fe_pending_order';

  var appConfig = { tokenPriceUsd: 0.02, tokenSymbol: 'FLASH', minOrderQty: 100, paymentMethods: [] };
  var pollTimer  = null;
  var countdown  = null;
  var dismissed  = false;

  // ── Bootstrap ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadConfig();
    injectModal();
    bindForm();
    bindBanner();
  });

  // ── Load config from API on page load ─────────────────────
  async function loadConfig() {
    try {
      var res  = await fetch(API + '/config');
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Config load failed');

      appConfig = data;
      applyConfig();
      checkLocalStorageOrder();
    } catch (err) {
      console.warn('[FE] Config load failed, using defaults:', err.message);
      applyConfig();
      checkLocalStorageOrder();
    }
  }

  function applyConfig() {
    // Token symbol and price
    document.querySelectorAll('.fe-sym').forEach(function (el) { el.textContent = appConfig.tokenSymbol; });
    var priceEl = document.getElementById('fe-token-price');
    if (priceEl) priceEl.textContent = '$' + appConfig.tokenPriceUsd + ' USDT';
    var symEl = document.getElementById('fe-token-symbol');
    if (symEl) symEl.textContent = appConfig.tokenSymbol;

    // Min qty label
    var minLabel = document.getElementById('fe-min-qty-label');
    if (minLabel) minLabel.textContent = '(min ' + appConfig.minOrderQty + ')';

    // Quantity input min
    var qtyInput = document.getElementById('icox_quantity');
    if (qtyInput) qtyInput.min = appConfig.minOrderQty;

    // Payment methods dropdown
    buildPaymentMethodSelect();
  }

  function buildPaymentMethodSelect() {
    var select = document.getElementById('payment_method');
    if (!select) return;

    var methods = appConfig.paymentMethods;

    // Populate hidden native select (used for form value reads)
    if (!methods || !methods.length) {
      select.innerHTML = '<option value="">No payment methods available</option>';
      buildCustomDropdown(select, []);
      return;
    }
    select.innerHTML = methods.map(function (m) {
      return '<option value="' + m.code + '" data-icon="' + m.iconUrl + '" data-symbol="' + m.coinSymbol + '">' + m.name + '</option>';
    }).join('');

    buildCustomDropdown(select, methods);
  }

  function buildCustomDropdown(nativeSelect, methods) {
    // Hide native select and overlay icon (we replace both)
    nativeSelect.style.display = 'none';
    var oldIcon = document.getElementById('fe-coin-icon');
    if (oldIcon) oldIcon.style.display = 'none';

    var wrap = nativeSelect.parentNode;

    // Remove any previous custom dropdown
    var prev = wrap.querySelector('.fe-csel');
    if (prev) prev.parentNode.removeChild(prev);

    if (!methods.length) {
      var empty = document.createElement('div');
      empty.className = 'fe-csel';
      empty.style.cssText = 'border:1px solid #d9d9d9;border-radius:6px;padding:10px 14px;color:#888;background:#fff;font-size:14px;';
      empty.textContent = 'No payment methods available';
      wrap.appendChild(empty);
      return;
    }

    // ── Build DOM (all inline styles — immune to theme CSS overrides) ──
    var csel = document.createElement('div');
    csel.style.cssText = 'position:relative;user-select:none;font-family:inherit;';

    // Trigger (shows selected item)
    var trigger = document.createElement('div');
    trigger.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 36px 10px 12px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;transition:border-color .2s;position:relative;';
    trigger.onmouseenter = function(){ this.style.borderColor='#38385f'; };
    trigger.onmouseleave = function(){ this.style.borderColor= csel._open ? '#38385f' : '#d9d9d9'; };

    var trigImg = document.createElement('img');
    trigImg.style.cssText = 'width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;display:none;';
    trigImg.alt = '';

    var trigLabel = document.createElement('span');
    trigLabel.style.cssText = 'flex:1;font-size:14px;color:#333;line-height:1.4;';
    trigLabel.textContent = 'Select payment method';

    var trigArrow = document.createElement('span');
    trigArrow.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%) rotate(0deg);transition:transform .2s;font-size:10px;color:#888;';
    trigArrow.textContent = '▼';

    trigger.appendChild(trigImg);
    trigger.appendChild(trigLabel);
    trigger.appendChild(trigArrow);
    csel.appendChild(trigger);

    // Dropdown list
    var list = document.createElement('div');
    list.style.cssText = 'display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid #d0d0e8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:9999;max-height:260px;overflow-y:auto;';

    methods.forEach(function (m, idx) {
      var opt = document.createElement('div');
      opt.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:' + (idx === 0 ? '#ededfc' : '#fff') + ';transition:background .15s;';
      opt.dataset.value  = m.code;
      opt.dataset.icon   = m.iconUrl || '';
      opt.dataset.symbol = m.coinSymbol || '';

      var optImg = document.createElement('img');
      optImg.style.cssText = 'width:26px;height:26px;min-width:26px;border-radius:50%;object-fit:cover;flex-shrink:0;display:inline-block;';
      optImg.src = m.iconUrl || '';
      optImg.alt = m.coinSymbol || '';
      optImg.onerror = function() {
        // Fallback: coloured circle with coin initial
        this.style.display = 'none';
        if (!this.nextSibling || !this.nextSibling._isFallback) {
          var fb = document.createElement('span');
          fb._isFallback = true;
          fb.style.cssText = 'width:26px;height:26px;min-width:26px;border-radius:50%;background:#38385f;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
          fb.textContent = (m.coinSymbol || '?').slice(0,2).toUpperCase();
          opt.insertBefore(fb, this.nextSibling);
        }
      };

      var optName = document.createElement('span');
      optName.style.cssText = 'font-size:14px;color:#333;font-weight:500;flex:1;';
      optName.textContent = m.name;

      var optSym = document.createElement('span');
      optSym.style.cssText = 'font-size:11px;color:#888;';
      optSym.textContent = m.coinSymbol || '';

      opt.appendChild(optImg);
      opt.appendChild(optName);
      opt.appendChild(optSym);

      opt.onmouseenter = function(){ if(this.dataset.value !== nativeSelect.value) this.style.background='#f4f3ff'; };
      opt.onmouseleave = function(){ if(this.dataset.value !== nativeSelect.value) this.style.background='#fff'; };

      list.appendChild(opt);
    });

    csel.appendChild(list);
    wrap.appendChild(csel);

    // ── Select first option by default ───────────────────────
    selectOption(methods[0], nativeSelect, trigImg, trigLabel);

    csel._open = false;

    function openDropdown() {
      csel._open = true;
      list.style.display = 'block';
      trigArrow.style.transform = 'translateY(-50%) rotate(180deg)';
      trigger.style.borderColor = '#38385f';
    }
    function closeDropdown() {
      csel._open = false;
      list.style.display = 'none';
      trigArrow.style.transform = 'translateY(-50%) rotate(0deg)';
      trigger.style.borderColor = '#d9d9d9';
    }

    // ── Toggle open/close ─────────────────────────────────────
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (csel._open) { closeDropdown(); } else { closeAllDropdowns(); openDropdown(); }
    });

    // ── Option click ──────────────────────────────────────────
    list.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('[data-value]') : (function(el){ while(el && !el.dataset.value) el=el.parentNode; return el; })(e.target);
      if (!opt || !opt.dataset.value) return;
      // Reset all option backgrounds
      var allOpts = list.querySelectorAll('[data-value]');
      allOpts.forEach(function(o){ o.style.background = '#fff'; });
      opt.style.background = '#ededfc';
      var optName = opt.querySelector('span');
      selectOption({
        code:       opt.dataset.value,
        iconUrl:    opt.dataset.icon,
        coinSymbol: opt.dataset.symbol,
        name:       optName ? optName.textContent : opt.dataset.value,
      }, nativeSelect, trigImg, trigLabel);
      closeDropdown();
    });

    // ── Close on outside click ────────────────────────────────
    document.addEventListener('click', function () { if(csel._open) closeDropdown(); });
    csel.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function selectOption(m, nativeSelect, trigImg, trigLabel) {
    if (!m) return;
    nativeSelect.value = m.code;
    if (m.iconUrl) {
      trigImg.src           = m.iconUrl;
      trigImg.style.display = 'inline-block';
      trigImg.onerror       = function () { trigImg.style.display = 'none'; };
    } else {
      trigImg.style.display = 'none';
    }
    trigLabel.textContent = m.name || m.code;
  }

  function closeAllDropdowns() {
    // Inline-style dropdowns close themselves via their own closeDropdown fn;
    // this is a no-op stub kept for compatibility.
  }

  // kept for compatibility — no-op now that custom dropdown handles icon
  function updateCoinIcon() {}

  // ── Form Binding ───────────────────────────────────────────
  function bindForm() {
    var qtyInput = document.getElementById('icox_quantity');
    var buyBtn   = document.getElementById('fe-buy-btn');

    if (qtyInput) {
      qtyInput.addEventListener('input', calcTotal);
      qtyInput.addEventListener('change', calcTotal);
    }
    if (buyBtn) buyBtn.addEventListener('click', handleBuyClick);
  }

  function calcTotal() {
    var qtyInput   = document.getElementById('icox_quantity');
    var totalInput = document.getElementById('usdt_amount');
    if (!qtyInput || !totalInput) return;
    var qty = parseFloat(qtyInput.value);
    totalInput.value = (!isNaN(qty) && qty > 0)
      ? '$' + (qty * appConfig.tokenPriceUsd).toFixed(2)
      : '';
  }

  // ── Buy Button Click ───────────────────────────────────────
  async function handleBuyClick() {
    var qty     = parseInt(document.getElementById('icox_quantity').value, 10);
    var method  = document.getElementById('payment_method').value;
    var wallet  = document.getElementById('receiving_wallet').value.trim();

    clearFormError();

    // Client-side pre-validation
    if (!qty || isNaN(qty) || qty < appConfig.minOrderQty) {
      return showFormError('Minimum quantity is ' + appConfig.minOrderQty + ' ' + appConfig.tokenSymbol);
    }
    if (!method) return showFormError('Please select a payment method.');
    if (!wallet) return showFormError('Please enter your BEP-20 wallet address.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return showFormError('Invalid wallet address. Must be a 42-character hex address starting with 0x.');

    setBuyLoading(true);

    try {
      var res  = await fetch(API + '/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty, payment_method_code: method, receiving_wallet: wallet }),
      });
      var data = await res.json();

      if (!res.ok) return showFormError(data.error || 'Order creation failed');

      // Save to localStorage for recovery
      saveOrderToStorage(data);

      // Show modal
      showModal(data);
      startPolling(data.orderId);

    } catch (err) {
      showFormError('Network error. Please check your connection and try again.');
    } finally {
      setBuyLoading(false);
    }
  }

  // ── localStorage Recovery ──────────────────────────────────
  function saveOrderToStorage(order) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        orderId:            order.orderId,
        receivingWallet:    order.paymentAddress ? order.paymentAddress : '',
        uniqueCryptoAmount: order.uniqueCryptoAmount,
        coinSymbol:         order.coinSymbol,
        tokenAmount:        order.tokenAmount,
        expiresAt:          order.expiresAt,
        savedAt:            new Date().toISOString(),
      }));
    } catch (e) {}
  }

  async function checkLocalStorageOrder() {
    if (dismissed) return;
    try {
      var saved = localStorage.getItem(LS_KEY);
      if (!saved) return;
      var data = JSON.parse(saved);

      if (!data.orderId) return;
      if (new Date(data.expiresAt) < new Date()) { localStorage.removeItem(LS_KEY); return; }

      // Poll for current status
      var res   = await fetch(API + '/order/' + data.orderId);
      var order = await res.json();

      if (!res.ok || !['waiting_payment', 'matched', 'sending'].includes(order.status)) {
        localStorage.removeItem(LS_KEY);
        return;
      }

      // Show banner
      var banner   = document.getElementById('fe-pending-banner');
      var infoSpan = document.getElementById('fe-banner-info');
      if (banner) {
        banner.style.display = 'block';
        if (infoSpan) {
          infoSpan.textContent = '— ' + data.tokenAmount + ' ' + appConfig.tokenSymbol
            + ' · ' + order.timeRemaining.display + ' remaining';
        }
        // Store for resume
        banner.dataset.orderId = data.orderId;
      }
    } catch (e) {
      localStorage.removeItem(LS_KEY);
    }
  }

  function bindBanner() {
    var resumeBtn  = document.getElementById('fe-banner-resume');
    var dismissBtn = document.getElementById('fe-banner-dismiss');
    var checkToggle = document.getElementById('fe-check-toggle');
    var checkForm  = document.getElementById('fe-check-form');
    var lookupBtn  = document.getElementById('fe-lookup-btn');

    if (resumeBtn) resumeBtn.addEventListener('click', async function () {
      var orderId = document.getElementById('fe-pending-banner').dataset.orderId;
      if (!orderId) return;
      try {
        var res   = await fetch(API + '/order/' + orderId);
        var order = await res.json();
        if (!res.ok) return;
        showModalFromOrder(order);
        startPolling(orderId);
      } catch (e) {}
    });

    if (dismissBtn) dismissBtn.addEventListener('click', function () {
      dismissed = true;
      var banner = document.getElementById('fe-pending-banner');
      if (banner) banner.style.display = 'none';
    });

    if (checkToggle) checkToggle.addEventListener('click', function () {
      var form = document.getElementById('fe-check-form');
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });

    if (lookupBtn) lookupBtn.addEventListener('click', async function () {
      var wallet   = document.getElementById('fe-lookup-wallet').value.trim();
      var errorEl  = document.getElementById('fe-lookup-error');
      errorEl.style.display = 'none';

      if (!wallet || wallet.length < 20) {
        errorEl.textContent = 'Please enter your wallet address';
        errorEl.style.display = 'block';
        return;
      }

      lookupBtn.textContent = 'Searching…';
      lookupBtn.disabled    = true;

      try {
        var res  = await fetch(API + '/order/lookup?wallet=' + encodeURIComponent(wallet));
        var data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error || 'No active order found';
          errorEl.style.display = 'block';
          return;
        }

        showModalFromOrder(data);
        startPolling(data.orderId);
        document.getElementById('fe-check-form').style.display = 'none';
      } catch (e) {
        errorEl.textContent = 'Lookup failed. Please try again.';
        errorEl.style.display = 'block';
      } finally {
        lookupBtn.textContent = 'Check';
        lookupBtn.disabled    = false;
      }
    });
  }

  // ── Polling ────────────────────────────────────────────────
  function startPolling(orderId) {
    stopPolling();
    pollTimer = setInterval(async function () {
      try {
        var res   = await fetch(API + '/order/' + orderId);
        var order = await res.json();
        if (!res.ok) return;
        updateModalStatus(order);
        if (['completed', 'failed', 'expired'].includes(order.status)) {
          stopPolling();
          if (order.status === 'completed') localStorage.removeItem(LS_KEY);
        }
      } catch (e) {}
    }, 5000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Modal ──────────────────────────────────────────────────
  function injectModal() {
    var html = '<div id="fe-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,10,30,.9);z-index:9999;overflow-y:auto;backdrop-filter:blur(4px);">'
      + '<div style="max-width:500px;margin:40px auto;padding:16px;">'
      + '<div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);">'

      // Header
      + '<div style="background:linear-gradient(135deg,#38385f,#5c5c9e);padding:22px 24px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div><h5 style="margin:0;font-size:17px;font-weight:700;">Complete Your Purchase</h5>'
      + '<p id="fe-modal-sub" style="margin:4px 0 0;font-size:12px;opacity:.75;">Send payment to receive your tokens</p></div>'
      + '<button id="fe-close" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1;">&times;</button>'
      + '</div>'

      // Status Banner
      + '<div id="fe-status" style="padding:9px 24px;font-size:13px;font-weight:600;text-align:center;background:#fff8e1;color:#7c6a00;">⏳ Awaiting Payment</div>'

      // Body
      + '<div style="padding:22px;">'

      // Timer
      + '<div style="text-align:center;margin-bottom:18px;">'
      + '<div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Time Remaining</div>'
      + '<div id="fe-timer" style="font-size:34px;font-weight:700;color:#38385f;font-family:monospace;">30:00</div>'
      + '</div>'

      // Amount box
      + '<div style="background:#f8f7ff;border:2px dashed #b0aee0;border-radius:12px;padding:16px;margin-bottom:14px;text-align:center;">'
      + '<div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Send Exactly This Amount</div>'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">'
      + '<span id="fe-amount" style="font-size:24px;font-weight:800;color:#38385f;font-family:monospace;word-break:break-all;">—</span>'
      + '<img id="fe-coin-img" src="" alt="" style="width:28px;height:28px;border-radius:50%;display:none;">'
      + '<span id="fe-coin-sym" style="font-size:14px;font-weight:700;color:#7c7cb0;background:#e8e7ff;padding:4px 8px;border-radius:6px;">—</span>'
      + '</div>'
      + '<button id="fe-copy-amount" style="font-size:12px;background:#38385f;color:#fff;border:none;padding:4px 14px;border-radius:20px;cursor:pointer;">Copy Amount</button>'
      + '</div>'

      // QR + Address
      + '<div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">'
      + '<img id="fe-qr" src="" alt="QR" style="width:80px;height:80px;border-radius:8px;border:1px solid #e8e7ff;flex-shrink:0;">'
      + '<div style="flex:1;">'
      + '<div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Payment Address</div>'
      + '<div style="background:#f5f5f5;border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:6px;">'
      + '<span id="fe-address" style="font-size:11px;font-family:monospace;word-break:break-all;flex:1;color:#333;">—</span>'
      + '<button id="fe-copy-addr" style="background:#38385f;color:#fff;border:none;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">Copy</button>'
      + '</div>'
      + '</div>'
      + '</div>'

      // Info row
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'
      + '<div style="background:#f8f7ff;border-radius:8px;padding:10px;text-align:center;">'
      + '<div style="font-size:10px;color:#888;text-transform:uppercase;">You Receive</div>'
      + '<div id="fe-tokens" style="font-size:16px;font-weight:700;color:#38385f;margin-top:2px;">—</div>'
      + '</div>'
      + '<div style="background:#f8f7ff;border-radius:8px;padding:10px;text-align:center;">'
      + '<div style="font-size:10px;color:#888;text-transform:uppercase;">Network</div>'
      + '<div id="fe-network" style="font-size:14px;font-weight:700;color:#38385f;margin-top:2px;">—</div>'
      + '</div>'
      + '</div>'

      // Warning
      + '<div style="background:#fff3cd;border-radius:8px;padding:10px;font-size:12px;color:#664d03;margin-bottom:14px;">'
      + '⚠️ <strong>Important:</strong> Send the <em>exact</em> amount shown. The unique decimal is your order fingerprint — a different amount will not be matched automatically.'
      + '</div>'

      // TX section (shown on completion)
      + '<div id="fe-tx-section" style="display:none;background:#d4edda;border-radius:8px;padding:12px;margin-bottom:14px;">'
      + '<div style="font-weight:700;color:#155724;margin-bottom:4px;">✅ Tokens Sent!</div>'
      + '<a id="fe-tx-link" href="#" target="_blank" style="color:#0d6efd;font-size:11px;font-family:monospace;word-break:break-all;">View Transaction</a>'
      + '</div>'

      // New order button (shown on expiry)
      + '<div id="fe-expired-section" style="display:none;text-align:center;">'
      + '<button id="fe-new-order-btn" style="background:#38385f;color:#fff;border:none;padding:10px 28px;border-radius:20px;cursor:pointer;font-size:14px;">Create New Order</button>'
      + '</div>'

      + '</div>' // /body
      + '</div>' // /card
      + '</div>' // /inner
      + '</div>'; // /overlay

    var el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el.firstChild);

    // Bind close
    document.getElementById('fe-close').addEventListener('click', closeModal);
    document.getElementById('fe-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });

    // Copy buttons
    document.getElementById('fe-copy-amount').addEventListener('click', function () {
      copyText(document.getElementById('fe-amount').textContent, this);
    });
    document.getElementById('fe-copy-addr').addEventListener('click', function () {
      copyText(document.getElementById('fe-address').textContent, this);
    });

    // New order button
    document.getElementById('fe-new-order-btn').addEventListener('click', function () {
      closeModal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function showModal(order) {
    populateModal(order);
    document.getElementById('fe-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    startCountdown(new Date(order.expiresAt));
  }

  function showModalFromOrder(order) {
    // Map lookup/status response to modal fields
    var mapped = {
      orderId:            order.orderId,
      paymentAddress:     order.paymentAddress,
      qrDataUrl:          null,
      uniqueCryptoAmount: order.uniqueCryptoAmount,
      coinSymbol:         order.coinSymbol,
      network:            order.network,
      tokenAmount:        order.tokenAmount,
      expiresAt:          order.expiresAt,
      txHashOut:          order.txHashOut,
      status:             order.status,
    };
    populateModal(mapped);
    updateModalStatus(order);
    document.getElementById('fe-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    startCountdown(new Date(order.expiresAt));
  }

  function populateModal(order) {
    setText('fe-amount', order.uniqueCryptoAmount);
    setText('fe-coin-sym', order.coinSymbol || '');
    setText('fe-address', order.paymentAddress || '');
    setText('fe-tokens', formatNum(order.tokenAmount) + ' ' + appConfig.tokenSymbol);
    setText('fe-network', (order.network || '').toUpperCase());

    // Coin icon
    var methods = appConfig.paymentMethods || [];
    var found   = methods.find(function (m) { return m.coinSymbol === order.coinSymbol; });
    var coinImg = document.getElementById('fe-coin-img');
    if (found && coinImg) {
      coinImg.src   = found.iconUrl;
      coinImg.style.display = 'block';
      coinImg.onerror = function () { coinImg.style.display = 'none'; };
    }

    // QR
    var qrImg = document.getElementById('fe-qr');
    if (qrImg) {
      if (order.qrDataUrl) {
        qrImg.src = order.qrDataUrl;
      } else if (order.paymentAddress) {
        // Fallback to QR API
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(order.paymentAddress);
      }
    }

    // Modal subtitle
    setText('fe-modal-sub', 'Send ' + (order.coinSymbol || '') + ' on ' + ((order.network || '').toUpperCase() || '') + ' to receive tokens');

    setStatusBanner('waiting_payment');
    document.getElementById('fe-tx-section').style.display     = 'none';
    document.getElementById('fe-expired-section').style.display = 'none';
  }

  function updateModalStatus(order) {
    setStatusBanner(order.status);

    if (order.timeRemaining) {
      setText('fe-timer', order.timeRemaining.display);
    }

    if (order.status === 'completed' && order.txHashOut) {
      document.getElementById('fe-tx-section').style.display = 'block';
      var link = document.getElementById('fe-tx-link');
      link.href        = order.txHashOut.url;
      link.textContent = order.txHashOut.hash;
    }

    if (order.status === 'expired') {
      document.getElementById('fe-expired-section').style.display = 'block';
    }
  }

  var STATUS_CFG = {
    waiting_payment: { text: '⏳ Awaiting Payment',           bg: '#fff8e1', color: '#7c6a00' },
    matched:         { text: '🔍 Payment Detected — Processing…', bg: '#e3f2fd', color: '#0d47a1' },
    sending:         { text: '📤 Sending Tokens to Your Wallet…', bg: '#e8f5e9', color: '#1b5e20' },
    completed:       { text: '✅ Complete! Tokens Sent',       bg: '#d4edda', color: '#155724' },
    expired:         { text: '⏰ Order Expired',               bg: '#f8d7da', color: '#721c24' },
    failed:          { text: '❌ Send Failed — Contact Support', bg: '#f8d7da', color: '#721c24' },
  };

  function setStatusBanner(status) {
    var el  = document.getElementById('fe-status');
    var cfg = STATUS_CFG[status] || STATUS_CFG.waiting_payment;
    if (!el) return;
    el.textContent       = cfg.text;
    el.style.background  = cfg.bg;
    el.style.color       = cfg.color;
  }

  function startCountdown(expiresAt) {
    if (countdown) clearInterval(countdown);
    function tick() {
      var ms   = Math.max(0, expiresAt - Date.now());
      var mins = Math.floor(ms / 60000);
      var secs = Math.floor((ms % 60000) / 1000);
      var timerEl = document.getElementById('fe-timer');
      if (!timerEl) return;
      timerEl.textContent = pad(mins) + ':' + pad(secs);
      if (ms < 300000) timerEl.style.color = '#dc3545';
      else if (ms < 600000) timerEl.style.color = '#fd7e14';
      else timerEl.style.color = '#38385f';
      if (ms === 0) clearInterval(countdown);
    }
    tick();
    countdown = setInterval(tick, 1000);
  }

  function closeModal() {
    var overlay = document.getElementById('fe-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    stopPolling();
    if (countdown) { clearInterval(countdown); countdown = null; }
    // Recheck storage for banner
    setTimeout(checkLocalStorageOrder, 300);
  }

  // ── Helpers ────────────────────────────────────────────────
  function setText(id, text) { var el = document.getElementById(id); if (el) el.textContent = text; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatNum(n) { return Number(n).toLocaleString('en-US'); }

  function copyText(text, btn) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var orig = btn.textContent;
        btn.textContent    = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(function () { btn.textContent = orig; btn.style.background = ''; }, 1500);
      });
    }
  }

  function setBuyLoading(loading) {
    var btn = document.getElementById('fe-buy-btn');
    if (!btn) return;
    btn.disabled    = loading;
    btn.textContent = loading ? 'Processing…' : 'Buy Flash Now';
  }

  function showFormError(msg) {
    var el = document.getElementById('fe-form-error');
    if (!el) return;
    el.textContent   = '⚠️ ' + msg;
    el.style.display = 'block';
  }

  function clearFormError() {
    var el = document.getElementById('fe-form-error');
    if (el) el.style.display = 'none';
  }

})();
