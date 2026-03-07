/**
 * Flash Exchange — Frontend Logic v3.0
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

  // CDN base for coin SVG icons
  var ICON_CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

  // Maps network key → native coin symbol (used to decide when to show badge)
  var NETWORK_NATIVE = { bsc: 'bnb', eth: 'eth', tron: 'trx' };

  // ── Bootstrap ──────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    loadConfig();
    injectModal();
    bindForm();
    bindBanner();
  });

  // ── Config ─────────────────────────────────────────────────
  async function loadConfig() {
    try {
      var res  = await fetch(API + '/config');
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Config load failed');
      appConfig = data;
    } catch (err) {
      console.warn('[FE] Config load failed, using defaults:', err.message);
    }
    applyConfig();
    checkLocalStorageOrder();
  }

  function applyConfig() {
    document.querySelectorAll('.fe-sym').forEach(function (el) { el.textContent = appConfig.tokenSymbol; });
    var priceEl = document.getElementById('fe-token-price');
    if (priceEl) priceEl.textContent = '$' + appConfig.tokenPriceUsd + ' USDT';
    var symEl = document.getElementById('fe-token-symbol');
    if (symEl) symEl.textContent = appConfig.tokenSymbol;
    var minLabel = document.getElementById('fe-min-qty-label');
    if (minLabel) minLabel.textContent = '(min ' + appConfig.minOrderQty + ')';
    var qtyInput = document.getElementById('icox_quantity');
    if (qtyInput) qtyInput.min = appConfig.minOrderQty;
    buildPaymentMethodSelect();
  }

  // ── Payment method dropdown ─────────────────────────────────
  // Icons use CSS background-image on div elements — completely immune to
  // any theme img rules (max-width, height:auto, display:none !important, etc.)
  // List is appended to <body> with position:fixed — escapes overflow:hidden parents

  function makeCoinIconDiv(coinSymbol, size) {
    var url = ICON_CDN + '/' + (coinSymbol || '').toLowerCase() + '.svg';
    var d   = document.createElement('div');
    d.style.cssText = [
      'width:'              + size + 'px',
      'height:'             + size + 'px',
      'min-width:'          + size + 'px',
      'border-radius:50%',
      'background-image:url(' + url + ')',
      'background-size:cover',
      'background-position:center',
      'background-repeat:no-repeat',
      'background-color:#f0f0f0',
      'flex-shrink:0',
      'display:inline-block',
    ].join(';');
    return d;
  }

  function makeCompositeIcon(method, size) {
    size = size || 26;
    var coinSym    = (method.coinSymbol || '').toLowerCase();
    var networkKey = (method.network   || '').toLowerCase();
    var nativeCoin = NETWORK_NATIVE[networkKey];
    var showBadge  = nativeCoin && coinSym !== nativeCoin;
    var badgeSize  = Math.round(size * 0.48);

    var wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:relative',
      'width:'     + size + 'px',
      'height:'    + size + 'px',
      'min-width:' + size + 'px',
      'flex-shrink:0',
      'display:inline-block',
    ].join(';');

    wrap.appendChild(makeCoinIconDiv(method.coinSymbol, size));

    if (showBadge) {
      var badge = makeCoinIconDiv(nativeCoin, badgeSize);
      badge.style.position   = 'absolute';
      badge.style.bottom     = '-2px';
      badge.style.right      = '-2px';
      badge.style.border     = '1.5px solid #fff';
      badge.style.boxSizing  = 'border-box';
      badge.style.borderRadius = '50%';
      wrap.appendChild(badge);
    }

    return wrap;
  }

  function buildPaymentMethodSelect() {
    var nativeSel = document.getElementById('payment_method');
    if (!nativeSel) return;

    var methods = appConfig.paymentMethods || [];

    // Keep native <select> hidden — used by handleBuyClick to read value
    nativeSel.style.display = 'none';
    var oldIcon = document.getElementById('fe-coin-icon');
    if (oldIcon) oldIcon.style.display = 'none';

    // Sync native select options
    nativeSel.innerHTML = methods.length
      ? '<option value="">Select Payment Method</option>' + methods.map(function (m) {
          return '<option value="' + m.code + '">' + m.name + '</option>';
        }).join('')
      : '<option value="">No payment methods available</option>';

    // Remove any previous custom dropdown + orphaned list
    var wrap    = nativeSel.parentNode;
    var oldWrap = document.getElementById('fe-csel-wrap');
    if (oldWrap) oldWrap.parentNode.removeChild(oldWrap);
    var oldList = document.getElementById('fe-csel-list');
    if (oldList) oldList.parentNode.removeChild(oldList);

    if (!methods.length) {
      var empty = document.createElement('div');
      empty.style.cssText = 'border:1px solid #d9d9d9;border-radius:6px;padding:10px 14px;color:#888;background:#fff;font-size:14px;';
      empty.textContent   = 'No payment methods available';
      wrap.appendChild(empty);
      return;
    }

    // ── Trigger button ────────────────────────────────────────
    var trigWrap = document.createElement('div');
    trigWrap.id  = 'fe-csel-wrap';
    trigWrap.style.cssText = 'position:relative;';

    var trigger = document.createElement('div');
    trigger.setAttribute('role', 'combobox');
    trigger.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 36px 10px 12px',
      'border:1px solid #d9d9d9',
      'border-radius:6px',
      'background:#fff',
      'cursor:pointer',
      'position:relative',
      'min-height:44px',
      'box-sizing:border-box',
      'user-select:none',
      'transition:border-color .2s',
    ].join(';');

    var trigIcon = document.createElement('div');
    trigIcon.style.cssText = 'display:none;flex-shrink:0;';

    var trigLabel = document.createElement('span');
    trigLabel.style.cssText = 'flex:1;font-size:14px;color:#999;line-height:1.4;font-family:inherit;';
    trigLabel.textContent   = 'Select Payment Method';

    var trigArrow = document.createElement('span');
    trigArrow.style.cssText = [
      'position:absolute',
      'right:12px',
      'top:50%',
      'transform:translateY(-50%) rotate(0deg)',
      'font-size:10px',
      'color:#aaa',
      'pointer-events:none',
      'transition:transform .2s',
      'line-height:1',
    ].join(';');
    trigArrow.textContent = '▼';

    trigger.appendChild(trigIcon);
    trigger.appendChild(trigLabel);
    trigger.appendChild(trigArrow);
    trigWrap.appendChild(trigger);
    wrap.appendChild(trigWrap);

    // ── Dropdown list — appended to body, position:fixed ──────
    var list = document.createElement('div');
    list.id  = 'fe-csel-list';
    list.style.cssText = [
      'display:none',
      'position:fixed',
      'background:#fff',
      'border:1px solid #d0d0e8',
      'border-radius:10px',
      'box-shadow:0 8px 32px rgba(56,56,95,.18)',
      'z-index:99999',
      'overflow-y:auto',
      'overflow-x:hidden',
      '-webkit-overflow-scrolling:touch',
    ].join(';');
    document.body.appendChild(list);

    // Build option rows
    methods.forEach(function (m) {
      var opt = document.createElement('div');
      opt.dataset.value   = m.code;
      opt.dataset.symbol  = m.coinSymbol || '';
      opt.dataset.network = m.network    || '';
      opt.dataset.name    = m.name       || '';
      opt.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:12px',
        'padding:11px 16px',
        'cursor:pointer',
        'background:#fff',
        'transition:background .12s',
        'box-sizing:border-box',
      ].join(';');

      opt.appendChild(makeCompositeIcon(m, 28));

      var nameSpan = document.createElement('span');
      nameSpan.style.cssText    = 'font-size:14px;color:#222;font-weight:500;flex:1;font-family:inherit;pointer-events:none;';
      nameSpan.textContent      = m.name;
      opt.appendChild(nameSpan);

      var symSpan = document.createElement('span');
      symSpan.style.cssText  = 'font-size:11px;color:#999;font-family:inherit;pointer-events:none;';
      symSpan.textContent    = m.coinSymbol || '';
      opt.appendChild(symSpan);

      opt.addEventListener('mouseover', function () {
        if (nativeSel.value !== this.dataset.value) this.style.background = '#f4f3ff';
      });
      opt.addEventListener('mouseout', function () {
        if (nativeSel.value !== this.dataset.value) this.style.background = '#fff';
      });

      list.appendChild(opt);
    });

    // ── State & helpers ───────────────────────────────────────
    var isOpen = false;

    function reposition() {
      var r      = trigger.getBoundingClientRect();
      var viewH  = window.innerHeight;
      var viewW  = window.innerWidth;
      var below  = viewH - r.bottom - 8;
      var above  = r.top - 8;
      var maxH   = Math.min(280, Math.max(below >= 120 ? below : above, 120));
      var width  = Math.min(r.width, viewW - 16);
      var left   = Math.max(8, Math.min(r.left, viewW - width - 8));

      list.style.width     = width + 'px';
      list.style.left      = left  + 'px';
      list.style.maxHeight = maxH  + 'px';

      if (below >= 120 || below >= above) {
        list.style.top    = (r.bottom + 4) + 'px';
        list.style.bottom = 'auto';
      } else {
        list.style.bottom = (viewH - r.top + 4) + 'px';
        list.style.top    = 'auto';
      }
    }

    function openList() {
      isOpen = true;
      reposition();
      list.style.display    = 'block';
      trigger.style.borderColor = '#38385f';
      trigArrow.style.transform = 'translateY(-50%) rotate(180deg)';
      trigArrow.style.color     = '#38385f';
    }

    function closeList() {
      isOpen = false;
      list.style.display    = 'none';
      trigger.style.borderColor = '#d9d9d9';
      trigArrow.style.transform = 'translateY(-50%) rotate(0deg)';
      trigArrow.style.color     = '#aaa';
    }

    function selectMethod(m) {
      nativeSel.value = m.code;

      trigIcon.innerHTML  = '';
      trigIcon.appendChild(makeCompositeIcon(m, 24));
      trigIcon.style.cssText = 'display:inline-block;flex-shrink:0;line-height:0;';

      trigLabel.textContent = m.name || m.code;
      trigLabel.style.color = '#222';

      list.querySelectorAll('[data-value]').forEach(function (o) {
        o.style.background = o.dataset.value === m.code ? '#ededfc' : '#fff';
      });
    }

    // No auto-select — user must choose a payment method

    // Toggle trigger
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      isOpen ? closeList() : openList();
    });

    // Option click
    list.addEventListener('click', function (e) {
      var opt = e.target;
      while (opt && opt !== list && !opt.dataset.value) opt = opt.parentNode;
      if (!opt || !opt.dataset.value) return;
      selectMethod({
        code:       opt.dataset.value,
        coinSymbol: opt.dataset.symbol,
        network:    opt.dataset.network,
        name:       opt.dataset.name,
      });
      closeList();
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (isOpen && !trigger.contains(e.target) && !list.contains(e.target)) closeList();
    });

    // Reposition during scroll / resize (covers mobile orientation change)
    window.addEventListener('scroll', function () { if (isOpen) reposition(); }, true);
    window.addEventListener('resize', function () { if (isOpen) reposition(); });

    trigger.addEventListener('mouseenter', function () { if (!isOpen) trigger.style.borderColor = '#38385f'; });
    trigger.addEventListener('mouseleave', function () { if (!isOpen) trigger.style.borderColor = '#d9d9d9'; });
  }

  // ── Form Binding ───────────────────────────────────────────
  function bindForm() {
    var qtyInput = document.getElementById('icox_quantity');
    var buyBtn   = document.getElementById('fe-buy-btn');
    if (qtyInput) {
      qtyInput.addEventListener('input',  calcTotal);
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
      ? '$' + (qty * appConfig.tokenPriceUsd).toFixed(2) : '';
  }

  // ── Buy Button ─────────────────────────────────────────────
  async function handleBuyClick() {
    var qty    = parseInt(document.getElementById('icox_quantity').value, 10);
    var method = document.getElementById('payment_method').value;
    var wallet = document.getElementById('receiving_wallet').value.trim();

    clearFormError();

    if (!qty || isNaN(qty) || qty < appConfig.minOrderQty)
      return showFormError('Minimum quantity is ' + appConfig.minOrderQty + ' ' + appConfig.tokenSymbol);
    if (!method) return showFormError('Please choose a payment currency.');
    if (!wallet) return showFormError('Please enter your BEP-20 wallet address.');
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet))
      return showFormError('Invalid wallet address. Must be a 42-character hex address starting with 0x.');

    setBuyLoading(true);
    try {
      var res  = await fetch(API + '/order', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ quantity: qty, payment_method_code: method, receiving_wallet: wallet }),
      });
      var data = await res.json();
      if (!res.ok) return showFormError(data.error || 'Order creation failed');
      saveOrderToStorage(data);
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
        receivingWallet:    order.paymentAddress || '',
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

      var res   = await fetch(API + '/order/' + data.orderId);
      var order = await res.json();
      if (!res.ok || !['waiting_payment', 'matched', 'sending'].includes(order.status)) {
        localStorage.removeItem(LS_KEY); return;
      }
      var banner   = document.getElementById('fe-pending-banner');
      var infoSpan = document.getElementById('fe-banner-info');
      if (banner) {
        banner.style.display = 'block';
        if (infoSpan) infoSpan.textContent = '— ' + data.tokenAmount + ' ' + appConfig.tokenSymbol
          + ' · ' + order.timeRemaining.display + ' remaining';
        banner.dataset.orderId = data.orderId;
      }
    } catch (e) { localStorage.removeItem(LS_KEY); }
  }

  function bindBanner() {
    var resumeBtn   = document.getElementById('fe-banner-resume');
    var dismissBtn  = document.getElementById('fe-banner-dismiss');
    var checkToggle = document.getElementById('fe-check-toggle');
    var lookupBtn   = document.getElementById('fe-lookup-btn');

    if (resumeBtn) resumeBtn.addEventListener('click', async function () {
      var orderId = document.getElementById('fe-pending-banner').dataset.orderId;
      if (!orderId) return;
      try {
        var res = await fetch(API + '/order/' + orderId);
        var order = await res.json();
        if (res.ok) { showModalFromOrder(order); startPolling(orderId); }
      } catch (e) {}
    });

    if (dismissBtn) dismissBtn.addEventListener('click', function () {
      dismissed = true;
      var b = document.getElementById('fe-pending-banner');
      if (b) b.style.display = 'none';
    });

    if (checkToggle) checkToggle.addEventListener('click', function () {
      var f = document.getElementById('fe-check-form');
      if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    });

    if (lookupBtn) lookupBtn.addEventListener('click', async function () {
      var wallet  = document.getElementById('fe-lookup-wallet').value.trim();
      var errorEl = document.getElementById('fe-lookup-error');
      errorEl.style.display = 'none';
      if (!wallet || wallet.length < 20) {
        errorEl.textContent = 'Please enter your wallet address';
        errorEl.style.display = 'block'; return;
      }
      lookupBtn.textContent = 'Searching…';
      lookupBtn.disabled    = true;
      try {
        var res  = await fetch(API + '/order/lookup?wallet=' + encodeURIComponent(wallet));
        var data = await res.json();
        if (!res.ok) {
          errorEl.textContent = data.error || 'No active order found';
          errorEl.style.display = 'block'; return;
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
    var html = '<div id="fe-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(10,10,30,.9);z-index:99999;overflow-y:auto;backdrop-filter:blur(4px);">'
      + '<div style="max-width:500px;margin:40px auto;padding:16px;">'
      + '<div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);">'
      + '<div style="background:linear-gradient(135deg,#38385f,#5c5c9e);padding:22px 24px;color:#fff;display:flex;justify-content:space-between;align-items:flex-start;">'
      + '<div><h5 style="margin:0;font-size:17px;font-weight:700;color:#fff;">Complete Your Purchase</h5>'
      + '<p id="fe-modal-sub" style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.9);">Send payment to receive your tokens</p></div>'
      + '<button id="fe-close" style="background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1;">&times;</button>'
      + '</div>'
      + '<div id="fe-status" style="padding:9px 24px;font-size:13px;font-weight:600;text-align:center;background:#fff8e1;color:#7c6a00;">⏳ Awaiting Payment</div>'
      + '<div style="padding:22px;">'
      + '<div style="text-align:center;margin-bottom:18px;"><div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Time Remaining</div>'
      + '<div id="fe-timer" style="font-size:34px;font-weight:700;color:#38385f;font-family:monospace;">30:00</div></div>'
      + '<div style="background:#f8f7ff;border:2px dashed #b0aee0;border-radius:12px;padding:16px;margin-bottom:14px;text-align:center;">'
      + '<div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Send Exactly This Amount</div>'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;">'
      + '<span id="fe-amount" style="font-size:24px;font-weight:800;color:#38385f;font-family:monospace;word-break:break-all;">—</span>'
      + '<img id="fe-coin-img" src="" alt="" style="width:28px;height:28px;border-radius:50%;display:none;">'
      + '<span id="fe-coin-sym" style="font-size:14px;font-weight:700;color:#7c7cb0;background:#e8e7ff;padding:4px 8px;border-radius:6px;">—</span>'
      + '</div>'
      + '<button id="fe-copy-amount" style="font-size:12px;background:#38385f;color:#fff;border:none;padding:4px 14px;border-radius:20px;cursor:pointer;">Copy Amount</button>'
      + '</div>'
      + '<div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start;">'
      + '<img id="fe-qr" src="" alt="QR" style="width:160px;height:160px;border-radius:8px;border:1px solid #e8e7ff;flex-shrink:0;">'
      + '<div style="flex:1;"><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Payment Address</div>'
      + '<div style="background:#f5f5f5;border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:6px;">'
      + '<span id="fe-address" style="font-size:11px;font-family:monospace;word-break:break-all;flex:1;color:#333;">—</span>'
      + '<button id="fe-copy-addr" style="background:#38385f;color:#fff;border:none;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap;">Copy</button>'
      + '</div></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'
      + '<div style="background:#f8f7ff;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">You Receive</div>'
      + '<div id="fe-tokens" style="font-size:16px;font-weight:700;color:#38385f;margin-top:2px;">—</div></div>'
      + '<div style="background:#f8f7ff;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:#888;text-transform:uppercase;">Network</div>'
      + '<div id="fe-network" style="font-size:14px;font-weight:700;color:#38385f;margin-top:2px;">—</div></div></div>'
      + '<div style="background:#fff3cd;border-radius:8px;padding:10px;font-size:12px;color:#664d03;margin-bottom:14px;">'
      + '⚠️ <strong>Important:</strong> Send the <em>exact</em> amount shown. The unique decimal is your order fingerprint — a different amount will not be matched automatically.</div>'
      + '<div id="fe-tx-section" style="display:none;background:#d4edda;border-radius:8px;padding:12px;margin-bottom:14px;">'
      + '<div style="font-weight:700;color:#155724;margin-bottom:4px;">✅ Tokens Sent!</div>'
      + '<a id="fe-tx-link" href="#" target="_blank" style="color:#0d6efd;font-size:11px;font-family:monospace;word-break:break-all;">View Transaction</a></div>'
      + '<div id="fe-expired-section" style="display:none;text-align:center;">'
      + '<button id="fe-new-order-btn" style="background:#38385f;color:#fff;border:none;padding:10px 28px;border-radius:20px;cursor:pointer;font-size:14px;">Create New Order</button>'
      + '</div></div></div></div></div>';

    var el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el.firstChild);

    document.getElementById('fe-close').addEventListener('click', closeModal);
    document.getElementById('fe-overlay').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    document.getElementById('fe-copy-amount').addEventListener('click', function () { copyText(document.getElementById('fe-amount').textContent, this); });
    document.getElementById('fe-copy-addr').addEventListener('click', function () { copyText(document.getElementById('fe-address').textContent, this); });
    document.getElementById('fe-new-order-btn').addEventListener('click', function () { closeModal(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  function showModal(order) {
    populateModal(order);
    document.getElementById('fe-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    startCountdown(new Date(order.expiresAt));
  }

  function showModalFromOrder(order) {
    populateModal({
      orderId: order.orderId, paymentAddress: order.paymentAddress, qrDataUrl: null,
      uniqueCryptoAmount: order.uniqueCryptoAmount, coinSymbol: order.coinSymbol,
      network: order.network, tokenAmount: order.tokenAmount, expiresAt: order.expiresAt,
      txHashOut: order.txHashOut, status: order.status,
    });
    updateModalStatus(order);
    document.getElementById('fe-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    startCountdown(new Date(order.expiresAt));
  }

  function populateModal(order) {
    setText('fe-amount',  order.uniqueCryptoAmount);
    setText('fe-coin-sym', order.coinSymbol || '');
    setText('fe-address', order.paymentAddress || '');
    setText('fe-tokens',  formatNum(order.tokenAmount) + ' ' + appConfig.tokenSymbol);
    setText('fe-network', (order.network || '').toUpperCase());

    var coinImg = document.getElementById('fe-coin-img');
    if (coinImg && order.coinSymbol) {
      coinImg.src = ICON_CDN + '/' + order.coinSymbol.toLowerCase() + '.svg';
      coinImg.style.display = 'block';
      coinImg.onerror = function () { this.style.display = 'none'; };
    }

    var qrImg = document.getElementById('fe-qr');
    if (qrImg) {
      qrImg.src = order.qrDataUrl ||
        'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(order.paymentAddress || '');
    }

    setText('fe-modal-sub', 'Send ' + (order.coinSymbol || '') + ' on ' + (order.network || '').toUpperCase() + ' to receive tokens');
    setStatusBanner('waiting_payment');
    document.getElementById('fe-tx-section').style.display      = 'none';
    document.getElementById('fe-expired-section').style.display  = 'none';
  }

  function updateModalStatus(order) {
    setStatusBanner(order.status);
    if (order.timeRemaining) setText('fe-timer', order.timeRemaining.display);
    if (order.status === 'completed' && order.txHashOut) {
      document.getElementById('fe-tx-section').style.display = 'block';
      var link = document.getElementById('fe-tx-link');
      link.href = order.txHashOut.url; link.textContent = order.txHashOut.hash;
    }
    if (order.status === 'expired') document.getElementById('fe-expired-section').style.display = 'block';
  }

  var STATUS_CFG = {
    waiting_payment: { text: '⏳ Awaiting Payment',               bg: '#fff8e1', color: '#7c6a00' },
    matched:         { text: '🔍 Payment Detected — Processing…', bg: '#e3f2fd', color: '#0d47a1' },
    sending:         { text: '📤 Sending Tokens to Your Wallet…', bg: '#e8f5e9', color: '#1b5e20' },
    completed:       { text: '✅ Complete! Tokens Sent',           bg: '#d4edda', color: '#155724' },
    expired:         { text: '⏰ Order Expired',                   bg: '#f8d7da', color: '#721c24' },
    failed:          { text: '❌ Send Failed — Contact Support',   bg: '#f8d7da', color: '#721c24' },
  };

  function setStatusBanner(status) {
    var el = document.getElementById('fe-status');
    var cfg = STATUS_CFG[status] || STATUS_CFG.waiting_payment;
    if (!el) return;
    el.textContent = cfg.text; el.style.background = cfg.bg; el.style.color = cfg.color;
  }

  function startCountdown(expiresAt) {
    if (countdown) clearInterval(countdown);
    function tick() {
      var ms   = Math.max(0, expiresAt - Date.now());
      var el   = document.getElementById('fe-timer');
      if (!el) return;
      el.textContent = pad(Math.floor(ms / 60000)) + ':' + pad(Math.floor((ms % 60000) / 1000));
      el.style.color = ms < 300000 ? '#dc3545' : ms < 600000 ? '#fd7e14' : '#38385f';
      if (ms === 0) clearInterval(countdown);
    }
    tick();
    countdown = setInterval(tick, 1000);
  }

  function closeModal() {
    var o = document.getElementById('fe-overlay');
    if (o) o.style.display = 'none';
    document.body.style.overflow = '';
    stopPolling();
    if (countdown) { clearInterval(countdown); countdown = null; }
    setTimeout(checkLocalStorageOrder, 300);
  }

  // ── Helpers ────────────────────────────────────────────────
  function setText(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function formatNum(n) { return Number(n).toLocaleString('en-US'); }

  function copyText(text, btn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      var orig = btn.textContent;
      btn.textContent = 'Copied!'; btn.style.background = '#28a745';
      setTimeout(function () { btn.textContent = orig; btn.style.background = ''; }, 1500);
    });
  }

  function setBuyLoading(on) {
    var btn = document.getElementById('fe-buy-btn');
    if (!btn) return;
    btn.disabled = on; btn.textContent = on ? 'Processing…' : 'Buy Flash Now';
  }

  function showFormError(msg) {
    var el = document.getElementById('fe-form-error');
    if (!el) return;
    el.textContent = '⚠️ ' + msg; el.style.display = 'block';
  }

  function clearFormError() {
    var el = document.getElementById('fe-form-error');
    if (el) el.style.display = 'none';
  }

})();
