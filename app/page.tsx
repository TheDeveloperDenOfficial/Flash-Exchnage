'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Countdown from '@/components/Countdown';
import TokenChart from '@/components/TokenChart';
import ExchangeModal from '@/components/ExchangeModal';

const TEAM = [
  { name: 'Louis Baker', role: 'CEO & Lead Blockchain', img: '/images/azalea/team-a.jpg', skills: [{ label: 'Blockchain', pct: 85 }, { label: 'Decentralization', pct: 68 }] },
  { name: 'Stefan Harary', role: 'CTO & Senior Developer', img: '/images/azalea/team-b.jpg', skills: [{ label: 'Development', pct: 92 }, { label: 'Architecture', pct: 78 }] },
  { name: 'Moises Teare', role: 'Blockchain App Developer', img: '/images/azalea/team-c.jpg', skills: [{ label: 'Smart Contracts', pct: 88 }, { label: 'Security', pct: 75 }] },
  { name: 'Janet Morris', role: 'Marketing Director', img: '/images/azalea/team-d.jpg', skills: [{ label: 'Growth', pct: 90 }, { label: 'Community', pct: 82 }] },
];

const BOARD = [
  { name: 'Ron Glabischnig', role: 'General Manager, Coindexin', img: '/images/azalea/team-c.jpg' },
  { name: 'Stefan Zakrisson', role: 'Legal Advisor, TokenWiz Project', img: '/images/azalea/team-b.jpg' },
  { name: 'Moises Teare', role: 'Managing Director, ICOCrypto', img: '/images/azalea/team-a.jpg' },
  { name: 'Michiel Berende', role: 'Insurance Lead & Financial Advisor', img: '/images/azalea/team-d.jpg' },
  { name: 'Noack Waylon', role: 'Ecosystem Manager & DevOps Engineer', img: '/images/azalea/team-b.jpg' },
  { name: 'Tobias Dalton', role: 'Member of the Operation Board', img: '/images/azalea/team-c.jpg' },
];

const PARTNERS = ['a-light', 'b-light', 'c-light', 'd-light', 'e-light', 'f-light', 'g-light'];

const ROADMAP = [
  { quarter: 'Q1 2024', dates: 'Jan – Apr 2024', status: 'finished', text: 'Creation of a decentralized marketplace to neural network adjacent coefficients.' },
  { quarter: 'Q2 2024', dates: 'May – Jun 2024', status: 'running', text: 'Start of the Flash Exchange Platform Development and introduction of advertiser auctions.' },
  { quarter: 'Q3 2024', dates: 'Jul – Sep 2024', status: '', text: 'Start Private Token Sale Round to our contributors.' },
  { quarter: 'Q4 2024', dates: 'Oct – Dec 2024', status: '', text: 'Launch of the mobile versions of the app and Press Tour.' },
  { quarter: 'Q1 2025', dates: 'Jan – Apr 2025', status: '', text: 'Release of the initial versions of operational applications and smart contracts.' },
  { quarter: 'Q2 2025', dates: 'May – Jun 2025', status: '', text: 'Global expansion and listing on major cryptocurrency exchanges.' },
];

const FAQS: { cat: string; items: string[] }[] = [
  {
    cat: 'General Questions',
    items: [
      'What is Flash Exchange?',
      'What cryptocurrencies can I use to purchase?',
      'How can I participate in the token sale?',
      'How do I benefit from Flash Exchange tokens?',
    ],
  },
  {
    cat: 'ICO Questions',
    items: [
      'When does the ICO start?',
      'What is the token price during ICO?',
      'Is there a minimum contribution?',
      'How are tokens distributed?',
    ],
  },
  {
    cat: 'Token Sales',
    items: [
      'How do I buy tokens?',
      'What wallets are supported?',
      'When will tokens be available?',
      'Are there any bonuses?',
    ],
  },
  {
    cat: 'Investors',
    items: [
      'Who can invest?',
      'What is the vesting schedule?',
      'How do I get a refund?',
      'Are there institutional tiers?',
    ],
  },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformTab, setPlatformTab] = useState(0);
  const [faqTab, setFaqTab] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [teamPopup, setTeamPopup] = useState<number | null>(null);
  const [roadmapIdx, setRoadmapIdx] = useState(0);
  const [showExchange, setShowExchange] = useState(false);
  const [loginModal, setLoginModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Sticky header shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Roadmap: show 4 at a time on desktop
  const visibleRoadmap = ROADMAP.slice(roadmapIdx, roadmapIdx + 4);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
  };

  return (
    <div className="nk-wrap">

      {/* ===== HEADER ===== */}
      <header
        className={`nk-header page-header is-transparent is-sticky is-dark${scrolled ? ' has-fixed' : ''}`}
        id="header"
      >
        <div className="header-main">
          <div className="header-container container container-xxl">
            <div className="header-wrap">
              {/* Logo */}
              <div className="header-logo logo">
                <a href="#header" className="logo-link">
                  <Image className="logo-dark" src="/images/logo-s2-white.png" width={140} height={40} alt="Flash Exchange" />
                </a>
              </div>

              {/* Mobile Toggle */}
              <div className="header-nav-toggle">
                <button
                  className="navbar-toggle"
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <div className="toggle-line"><span /></div>
                </button>
              </div>

              {/* Nav */}
              <div className={`header-navbar${menuOpen ? ' navbar-active' : ''}`}>
                <nav className="header-menu" id="header-menu">
                  <ul className="menu">
                    {[
                      ['#header', 'Home'],
                      ['#about', 'About'],
                      ['#platform', 'Platform'],
                      ['#mvp', 'MVP'],
                      ['#tokensale', 'Tokens'],
                      ['#roadmap', 'Roadmap'],
                      ['#contact', 'Contact'],
                    ].map(([href, label]) => (
                      <li key={label} className="menu-item">
                        <a className="menu-link nav-link" href={href} onClick={() => setMenuOpen(false)}>{label}</a>
                      </li>
                    ))}
                    <li className="menu-item has-sub">
                      <a className="menu-link nav-link menu-toggle" href="#">More</a>
                      <ul className="menu-sub menu-drop">
                        <li className="menu-item"><a className="menu-link nav-link" href="#docs" onClick={() => setMenuOpen(false)}>Docs</a></li>
                        <li className="menu-item"><a className="menu-link nav-link" href="#team" onClick={() => setMenuOpen(false)}>Team</a></li>
                        <li className="menu-item"><a className="menu-link nav-link" href="#faqs" onClick={() => setMenuOpen(false)}>FAQs</a></li>
                      </ul>
                    </li>
                  </ul>
                  <ul className="menu-btns">
                    <li>
                      <button
                        onClick={() => setLoginModal(true)}
                        className="btn btn-md btn-thin btn-outline btn-auto btn-round btn-primary no-change"
                        style={{ background: 'none', cursor: 'pointer' }}
                      >
                        <span>Login</span>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          </div>
        </div>

        {/* ===== BANNER / HERO ===== */}
        <div className="banner banner-fs tc-light">
          <div className="nk-block nk-block-header nk-block-sm my-auto">
            <div className="container pt-5">
              <div className="banner-caption text-center">
                <h1 className="title title-xl-2 ttu">Flash Exchange — Instant Crypto at Your Fingertips</h1>
                <div className="row justify-content-center pb-3">
                  <div className="col-sm-11 col-xl-11 col-xxl-8">
                    <p className="lead">
                      The fastest, most secure way to buy cryptocurrency tokens. Powered by blockchain technology with real-time pricing and instant order processing.
                    </p>
                  </div>
                </div>
                <div className="cpn-action">
                  <ul className="btn-grp mx-auto">
                    <li>
                      <button
                        onClick={() => setShowExchange(true)}
                        className="btn btn-primary btn-round"
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        BUY TOKENS NOW
                      </button>
                    </li>
                    <li>
                      <a href="#tokensale" className="menu-link btn btn-round btn-outline btn-primary">TOKEN DETAILS</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Status Bar */}
          <div className="nk-block nk-block-status">
            <div className="container container-xxl">
              <div className="row gutter-vr-40px justify-content-between">
                <div className="col-xxl-6 col-xl-5 col-lg-5">
                  <div className="progress-wrap progress-wrap-point">
                    <ul className="progress-info progress-info-s2">
                      <li>Raised — <span>11,250 Tokens</span></li>
                      <li className="text-end">Target — <span>150,000 Tokens</span></li>
                    </ul>
                    <div className="progress-bar progress-bar-xs">
                      <div className="progress-percent progress-percent-s2" style={{ width: '30%' }} />
                      <div className="progress-point" style={{ left: '25%' }}>Soft Cap</div>
                      <div className="progress-point" style={{ left: '55%' }}>Crowdsale</div>
                      <div className="progress-point" style={{ left: '85%' }}>Hard Cap</div>
                    </div>
                  </div>
                </div>
                <div className="col-xxl-5 col-xl-6 col-lg-7 text-center text-sm-start">
                  <div className="row justify-content-around gutter-vr-30px">
                    <div className="col-sm-4 col-md-6 col-lg-4 col-xl-5">
                      <div className="status-info">
                        <h6 className="title title-xxs tc-default status-title ttu">Current Bonus</h6>
                        <h3 className="fz-3 fw-3 status-percent">20%</h3>
                        <div className="fz-8">Contributors can receive</div>
                      </div>
                    </div>
                    <div className="col-sm-8 col-md-6 col-lg-7 col-xl-7">
                      <div className="status-countdown float-sm-end">
                        <h6 className="title title-xxs tc-default status-title ttu">The Bonus ends in</h6>
                        <Countdown targetDate="2025/12/31" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Social + Actions */}
          <div className="nk-block nk-block-actions">
            <div className="container container-xxl">
              <div className="row gutter-vr-40px align-items-center">
                <div className="col-sm-7 d-flex justify-content-center justify-content-sm-start">
                  <ul className="btn-grp btn-grp-break justify-content-center justify-content-sm-start gutter-vr-20px">
                    <li>
                      <button onClick={() => setShowExchange(true)} className="link link-light link-break" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
                        <em className="icon-circle icon-border icon-animation fas fa-exchange-alt" />
                        <span>Buy Tokens Now</span>
                      </button>
                    </li>
                    <li>
                      <a href="#about" className="link link-light link-break">
                        <em className="icon-circle icon-border far fa-lightbulb" />
                        <span>Why buy Tokens now?</span>
                      </a>
                    </li>
                  </ul>
                </div>
                <div className="col-sm-5">
                  <ul className="social-links social-links-s2 justify-content-center justify-content-sm-end">
                    {['twitter', 'medium-m', 'facebook-f', 'youtube', 'bitcoin', 'github'].map(icon => (
                      <li key={icon}><a href="#"><em className={`fab fa-${icon}`} /></a></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="nk-pages tc-light">

        {/* ===== ABOUT ===== */}
        <section className="section" id="about">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="What and Why">ABOUT</h2>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row justify-content-between align-items-center gutter-vr-40px">
                <div className="col-lg-6 order-lg-last">
                  <div className="gfx py-4">
                    <Image src="/images/azalea/gfx-e.png" width={560} height={420} alt="gfx" style={{ width: '100%', height: 'auto' }} />
                  </div>
                </div>
                <div className="col-lg-5">
                  <div className="nk-block-text">
                    <h2 className="title">We build the fastest Decentralized Exchange for Instant Crypto Access</h2>
                    <p>Flash Exchange is a state-of-the-art cryptocurrency exchange where you can securely and instantly buy tokens. The fastest and most flexible asset platform in existence, with real-time pricing, instant order processing, and secure payment verification.</p>
                    <p>Our aim is to make cryptocurrency accessible to everyone — with a simple, reliable, and transparent buying experience backed by blockchain technology.</p>
                    <ul className="btn-grp gutter-30px gutter-vr-20px pdt-m">
                      <li>
                        <button onClick={() => setShowExchange(true)} className="btn btn-round btn-primary btn-lg" style={{ cursor: 'pointer', border: 'none' }}>
                          <span>Buy Tokens</span> <em className="icon ti ti-arrow-right" />
                        </button>
                      </li>
                      <li><a href="#ecosystems" className="menu-link btn btn-underline">See the Ecosystems</a></li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== ECOSYSTEMS ===== */}
        <section className="section" id="ecosystems">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Core Ecosystems">ECOSYSTEMS</h2>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row text-center align-items-lg-start gutter-vr-40px">
                {[
                  ['ONE EXCHANGE', 'One unified exchange platform combining multiple token types with real-time pricing. Buy any supported cryptocurrency with instant processing.', 'feature-s6-1'],
                  ['Transparency & Trust', 'All transactions are recorded on the blockchain. Full visibility into pricing, fees, and order status at every step.', 'feature-s6-2'],
                  ['Blockchain Security', 'Enterprise-grade security with multi-signature wallet support, cold storage, and real-time transaction monitoring.', 'feature-s6-3'],
                  ['Payment Flexibility', 'Pay with multiple cryptocurrencies. Supports USDT (TRC20/ERC20), Bitcoin, Ethereum, and BNB.', 'feature-s6-4'],
                ].map(([title, desc, cls]) => (
                  <div key={title} className="col-lg-3 col-sm-6">
                    <div className={`feature feature-s6 ${cls}`}>
                      <div className="feature-text">
                        <h5 className="title title-sm ttu">{title}</h5>
                        <p>{desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-image bg-contain bg-bottom-center bg-ecosystems">
                <Image src="/images/globe-particle.png" width={800} height={400} alt="globe" style={{ width: '100%', height: 'auto' }} />
              </div>
            </div>
          </div>
        </section>

        {/* ===== PLATFORM ===== */}
        <section className="section" id="platform">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Platform">PLATFORM</h2>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row justify-content-center">
                <div className="col-xl-6 col-lg-8">
                  <ul className="nav tab-nav tab-nav-btn-bdr-s2 justify-content-center justify-content-sm-between pb-4 pb-sm-5">
                    {['For Buyers', 'For Traders'].map((label, i) => (
                      <li key={label}>
                        <a
                          className={platformTab === i ? 'active' : ''}
                          onClick={(e) => { e.preventDefault(); setPlatformTab(i); }}
                          href="#"
                          style={{ cursor: 'pointer' }}
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="tab-content">
                {[
                  {
                    title: 'A Simple Platform for Token Buyers',
                    desc: 'Each buyer can choose their token, enter their wallet address, and complete payment in minutes.',
                    features: [
                      ['ikon-bulb', 'Full access to real-time token prices with transparent fee structures and no hidden costs.'],
                      ['ikon-paricle', 'Multi-cryptocurrency payment support — pay with USDT, BTC, ETH, or BNB.'],
                      ['ikon-bulb-2', 'Instant order creation with QR code payment generation and live tracking.'],
                      ['ikon-document-2', 'Secure order confirmation with blockchain transaction hash verification.'],
                    ],
                    img: '/images/app-screens/sc-medium-a.png',
                  },
                  {
                    title: 'Advanced Tools for Traders',
                    desc: 'Traders get access to order management, price monitoring, and bulk purchase capabilities.',
                    features: [
                      ['ikon-bulb', 'Real-time price feeds with admin-controlled pricing for all token pairs.'],
                      ['ikon-paricle', 'Order history and status tracking for all active and completed trades.'],
                      ['ikon-bulb-2', 'Multiple wallet address support for different cryptocurrencies and networks.'],
                      ['ikon-document-2', 'Automated payment detection and order status updates.'],
                    ],
                    img: '/images/app-screens/sc-medium-a.png',
                  },
                ].map((tab, i) => (
                  <div key={i} className={`tab-pane fade${platformTab === i ? ' show active' : ''}`}>
                    <div className="row align-items-center justify-content-between gutter-vr-40px">
                      <div className="col-lg-6 order-lg-last">
                        <div className="nk-block-img nk-block-ca">
                          <div className="nk-circle-animation nk-df-center fast" />
                          <Image className="shadow rounded" src={tab.img} width={540} height={380} alt="" style={{ width: '100%', height: 'auto' }} />
                        </div>
                      </div>
                      <div className="col-lg-5">
                        <div className="nk-block-text mgb-m30">
                          <h2 className="title title-md">{tab.title}</h2>
                          <p>{tab.desc}</p>
                          {tab.features.map(([icon, text]) => (
                            <div key={text} className="feature feature-inline feature-middle">
                              <div className="feature-icon feature-icon-md">
                                <em className={`icon icon-md icon-grd ikon ${icon}`} />
                              </div>
                              <div className="feature-text"><p>{text}</p></div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== MVP ===== */}
        <section className="section" id="mvp">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="MVP Apps">MVP</h2>
                  <p>Our platform is based on a live, operational cryptocurrency exchange.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row align-items-center justify-content-center justify-content-xl-between gutter-vr-30px">
                <div className="col-xxl-6 col-xl-6 col-lg-8">
                  <div className="nk-block-img nk-block-plx">
                    <Image className="shadow rounded" src="/images/app-screens/sc-medium-b.png" width={600} height={400} alt="" style={{ width: '100%', height: 'auto' }} />
                    <Image className="nk-block-img-plx plx-screen shadow rounded" src="/images/app-screens/sc-small-d.jpg" width={200} height={150} alt="" />
                    <Image className="nk-block-img-plx plx-circle plx-circle-s1" src="/images/gfx/circle-a.png" width={100} height={100} alt="" />
                    <Image className="nk-block-img-plx plx-polygon plx-polygon-s1" src="/images/gfx/polygon-a.png" width={80} height={80} alt="" />
                    <Image className="nk-block-img-plx plx-triangle plx-triangle-s1" src="/images/gfx/triangle-a.png" width={60} height={60} alt="" />
                  </div>
                </div>
                <div className="col-xxl-5 col-xl-6 col-lg-8">
                  <div className="nk-block-text">
                    {[
                      'Powered by secure wallet infrastructure, Flash Exchange lets you instantly buy crypto tokens with minimal steps.',
                      'Full access to real-time pricing with transparent fee structures — no surprises, no hidden costs.',
                      'Multi-cryptocurrency payment support including USDT TRC20/ERC20, Bitcoin, Ethereum, and BNB.',
                      'Instant order creation with QR code generation and live blockchain payment tracking.',
                      'Admin dashboard for managing prices, orders, and wallet addresses in real time.',
                    ].map(text => (
                      <div key={text} className="feature feature-inline">
                        <div className="feature-icon feature-icon-md">
                          <em className="icon icon-xs icon-circle fas fa-check" />
                        </div>
                        <div className="feature-text"><p>{text}</p></div>
                      </div>
                    ))}
                    <div className="text-center text-sm-start">
                      <button onClick={() => setShowExchange(true)} className="btn btn-round btn-primary" style={{ cursor: 'pointer', border: 'none' }}>
                        Try it Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== TOKEN SALE ===== */}
        <section className="section" id="tokensale">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Token Details">TOKENS</h2>
                  <p>Breakdown of our Token Distribution.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row align-items-center gutter-vr-50px">
                <div className="col-xxl-4 col-lg-6 px-xl-5 order-xl-1">
                  <TokenChart />
                </div>
                <div className="col-xxl-4 col-xl-12 order-last">
                  <div className="token-info-s2">
                    <div className="row gutter-vr-50px">
                      {[
                        ['color-1', 'Start Time', '15 Sep, 2024'],
                        ['color-1', 'Token Symbol', 'FEX'],
                        ['color-2', 'End Time', '30 Nov, 2024'],
                        ['color-2', 'Tokens Offered', '15.0 M'],
                        ['color-3', 'Soft Cap', '1.5 K ETH'],
                        ['color-3', 'Hard Cap', '12.0 M'],
                        ['color-4', 'Crowdsale', '10.5 M'],
                        ['color-4', 'Token Price', '$0.10'],
                        ['color-5', 'Min Purchase', '100 FEX'],
                        ['color-5', 'Accepted', 'USDT, ETH, BTC'],
                      ].map(([color, label, value]) => (
                        <div key={label} className="col-6 col-xxl-6 col-lg-3">
                          <div className={`token-info-item ${color}`}>
                            <div className="token-info-title">{label}</div>
                            <h4 className="token-info-des">{value}</h4>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== ROADMAP ===== */}
        <section className="section" id="roadmap">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Timeline">ROADMAP</h2>
                  <p>Flash Exchange is building a global crypto exchange platform, powered by blockchain and smart contracts.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="roadmap-wrap roadmap-wrap-ovl-right text-center" style={{ position: 'relative' }}>
                <div className="roadmap-line-s2" />
                <div style={{ display: 'flex', gap: 0, overflowX: 'hidden', position: 'relative' }}>
                  {visibleRoadmap.map((item, i) => (
                    <div key={item.quarter} className={`roadmap roadmap-s2 roadmap-i${roadmapIdx + i + 1} ${item.status ? `roadmap-${item.status}` : ''}`} style={{ flex: '1 1 0', minWidth: 0 }}>
                      <h6 className="roadmap-year-s2">{item.quarter}</h6>
                      <h5 className="title title-sm roadmap-date">{item.dates}</h5>
                      <div className="roadmap-text"><p>{item.text}</p></div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 32 }}>
                  <button
                    onClick={() => setRoadmapIdx(Math.max(0, roadmapIdx - 1))}
                    disabled={roadmapIdx === 0}
                    className="btn btn-outline btn-round btn-sm"
                    style={{ cursor: 'pointer' }}
                  >‹</button>
                  <button
                    onClick={() => setRoadmapIdx(Math.min(ROADMAP.length - 4, roadmapIdx + 1))}
                    disabled={roadmapIdx >= ROADMAP.length - 4}
                    className="btn btn-outline btn-round btn-sm"
                    style={{ cursor: 'pointer' }}
                  >›</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== TEAM ===== */}
        <section className="section" id="team">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Core Team">OUR TEAM</h2>
                  <p>The people behind Flash Exchange — builders, traders, and blockchain experts.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row gutter-vr-40px">
                {TEAM.map((member, i) => (
                  <div key={member.name + i} className="col-lg-3 col-sm-6">
                    <div className={`team team-s2 ${i % 2 === 0 ? 'team-odd' : 'team-even'}`}>
                      <div className="team-photo team-photo-s2">
                        <Image src={member.img} width={300} height={300} alt={member.name} style={{ width: '100%', height: 'auto' }} />
                        <button
                          onClick={() => setTeamPopup(i)}
                          className="team-show"
                          style={{ background: 'none', border: 'none', position: 'absolute', inset: 0, cursor: 'pointer' }}
                        />
                      </div>
                      <h5 className="team-name title title-md">{member.name}</h5>
                      <span className="team-position">{member.role}</span>
                      <ul className="team-social team-social-s2">
                        {['facebook-f', 'linkedin-in', 'twitter'].map(icon => (
                          <li key={icon}><a href="#"><em className={`fab fa-${icon}`} /></a></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Board Members */}
            <div className="nk-block" style={{ marginTop: 60 }}>
              <div className="row justify-content-center text-center" style={{ marginBottom: 40 }}>
                <div className="col-lg-6">
                  <div className="section-head section-head-s2">
                    <h2 className="title title-xl" title="Advisors">BOARD MEMBERS</h2>
                    <p>Our advisors and board members are a great part of our team.</p>
                  </div>
                </div>
              </div>
              <div className="row">
                {BOARD.map((member, i) => (
                  <div key={member.name + i} className="col-md-4 col-lg-2 col-6">
                    <div className={`team team-s2 team-sm-s2 ${i % 2 === 0 ? 'team-odd' : 'team-even'}`}>
                      <div className="team-photo team-photo-s2">
                        <Image src={member.img} width={150} height={150} alt={member.name} style={{ width: '100%', height: 'auto' }} />
                      </div>
                      <h5 className="team-name title title-sm">{member.name}</h5>
                      <span className="team-position team-position-sm">{member.role}</span>
                      <ul className="team-social team-social-s2">
                        {['facebook-f', 'linkedin-in', 'twitter'].map(icon => (
                          <li key={icon}><a href="#"><em className={`fab fa-${icon}`} /></a></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Partners */}
            <div className="nk-block block-partners" style={{ marginTop: 60 }}>
              <h6 className="title title-md ttu text-center" style={{ marginBottom: 32 }}>Our Partners</h6>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', gap: 40, alignItems: 'center',
                  animation: 'marquee 20s linear infinite',
                }}>
                  {[...PARTNERS, ...PARTNERS].map((p, i) => (
                    <div key={i} className="partner-logo" style={{ flexShrink: 0 }}>
                      <Image src={`/images/partners/${p}.png`} width={120} height={60} alt={p} style={{ height: 40, width: 'auto', opacity: 0.7 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== DOCS ===== */}
        <section className="section" id="docs">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="Downloads">DOCUMENTS</h2>
                  <p>Download the whitepaper and learn about Flash Exchange.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="container container-xxl">
            <div className="nk-block">
              <div className="row gutter-vr-50px">
                {[
                  { title: 'White Paper', year: '2024', img: '/images/azalea/doc-a.jpg', shape: 'doc-shape-a' },
                  { title: 'Two Pager', year: '2024', img: '/images/azalea/doc-b.jpg', shape: 'doc-shape-b' },
                  { title: 'One Pager', year: '2024', img: '/images/azalea/doc-c.jpg', shape: 'doc-shape-c' },
                  { title: 'Presentation', year: '2024', img: '/images/azalea/doc-d.jpg', shape: 'doc-shape-d' },
                ].map(doc => (
                  <div key={doc.title} className="col-sm-6 col-lg-3">
                    <div className="doc">
                      <div className={`doc-photo doc-shape ${doc.shape}`}>
                        <Image src={doc.img} width={200} height={260} alt={doc.title} style={{ width: '100%', height: 'auto' }} />
                      </div>
                      <div className="doc-text">
                        <h5 className="doc-title title-sm">{doc.title} <small>({doc.year})</small></h5>
                        <a className="doc-download" href="#"><em className="ti ti-import" /></a>
                        <div className="doc-lang">ENGLISH</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== FAQs ===== */}
        <section className="section" id="faqs">
          <div className="container">
            <div className="row justify-content-center text-center">
              <div className="col-lg-6">
                <div className="section-head section-head-s2">
                  <h2 className="title title-xl" title="FAQS">FAQs</h2>
                  <p>Everything you need to know about Flash Exchange and our token sale.</p>
                </div>
              </div>
            </div>
            <div className="nk-block">
              <div className="row justify-content-center">
                <div className="col-xl-10">
                  <ul className="nav tab-nav tab-nav-btn tab-nav-btn-bdr tab-nav-center pdb-r">
                    {FAQS.map((f, i) => (
                      <li key={f.cat}>
                        <a
                          className={faqTab === i ? 'active' : ''}
                          href="#"
                          onClick={e => { e.preventDefault(); setFaqTab(i); setOpenFaq(0); }}
                          style={{ cursor: 'pointer' }}
                        >
                          {f.cat}
                        </a>
                      </li>
                    ))}
                  </ul>
                  <div className="accordion">
                    {FAQS[faqTab].items.map((question, i) => (
                      <div key={question} className="accordion-item accordion-item-s3">
                        <h5
                          className={`accordion-title accordion-title-sm${openFaq === i ? '' : ' collapsed'}`}
                          onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                          style={{ cursor: 'pointer' }}
                        >
                          {question} <span className="accordion-icon" />
                        </h5>
                        {openFaq === i && (
                          <div className="accordion-content">
                            <p>Once the token sale is launched, you can purchase tokens with USDT, Bitcoin, or Ethereum. You can also track your order using the Order ID provided after purchase.</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== CONTACT ===== */}
        <section className="section" id="contact">
          <div className="container">
            <div className="nk-block nk-block-contact">
              <div className="row justify-content-between align-items-center gutter-vr-50px">
                <div className="col-lg-6">
                  <div className="nk-block-text">
                    <div className="nk-block-text-head">
                      <h2 className="title title-lg ttu">Contact Us</h2>
                      <p>We are always open and we welcome any questions you have for our team. Fill out the form and someone will get back to you shortly.</p>
                    </div>
                    {contactSent ? (
                      <div style={{ padding: '24px', background: 'rgba(244,47,84,0.1)', borderRadius: 8, border: '1px solid #f42f54', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 600 }}>✓ Message sent! We&apos;ll get back to you soon.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleContactSubmit}>
                        <div className="row">
                          <div className="col-sm-6">
                            <div className="field-item">
                              <label className="field-label ttu">Your Name</label>
                              <div className="field-wrap">
                                <input
                                  type="text"
                                  className="input-bordered"
                                  placeholder="Introduce yourself"
                                  value={contactForm.name}
                                  onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                                  required
                                />
                              </div>
                            </div>
                          </div>
                          <div className="col-sm-6">
                            <div className="field-item">
                              <label className="field-label ttu">Your Email</label>
                              <div className="field-wrap">
                                <input
                                  type="email"
                                  className="input-bordered"
                                  placeholder="Who do we reply to"
                                  value={contactForm.email}
                                  onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="field-item">
                          <label className="field-label ttu">Your Message</label>
                          <div className="field-wrap">
                            <textarea
                              className="input-bordered input-textarea"
                              placeholder="Leave your question or comment here"
                              value={contactForm.message}
                              onChange={e => setContactForm({ ...contactForm, message: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="row">
                          <div className="col-sm-5 text-end">
                            <button type="submit" className="btn btn-round btn-primary">SEND</button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
                <div className="col-lg-5 text-center order-lg-first">
                  <div className="nk-block-contact nk-block-contact-s1">
                    <ul className="contact-list">
                      <li>
                        <em className="contact-icon fas fa-phone" />
                        <div className="contact-text"><span>+44 0123 4567</span></div>
                      </li>
                      <li>
                        <em className="contact-icon fas fa-envelope" />
                        <div className="contact-text"><span>info@flashexchange.io</span></div>
                      </li>
                      <li>
                        <em className="contact-icon fas fa-paper-plane" />
                        <div className="contact-text"><span>Join us on Telegram</span></div>
                      </li>
                    </ul>
                    <div className="nk-circle-animation nk-df-center white small" />
                  </div>
                  <ul className="social-links social-links-s2 justify-content-center">
                    {['twitter', 'medium-m', 'facebook-f', 'youtube', 'bitcoin', 'github'].map(icon => (
                      <li key={icon}><a href="#"><em className={`fab fa-${icon}`} /></a></li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="nk-footer-bar section section-s tc-light">
        <div className="container container-xxl">
          <div className="row gutter-vr-10px">
            <div className="col-lg-6 order-lg-last text-lg-end">
              <ul className="footer-nav">
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Sale</a></li>
              </ul>
            </div>
            <div className="col-lg-6">
              <div className="copyright-text copyright-text-s2">
                Copyright &copy; {new Date().getFullYear()} Flash Exchange. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </footer>

      <div className="nk-ovm nk-ovm-repeat nk-ovm-fixed shape-i">
        <div className="ovm-line" />
      </div>

      {/* ===== TEAM POPUP MODAL ===== */}
      {teamPopup !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setTeamPopup(null)}
        >
          <div
            className="bg-theme tc-light"
            style={{ width: '100%', maxWidth: 640, borderRadius: 12, padding: 32, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setTeamPopup(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'inherit', fontSize: 20, cursor: 'pointer' }}>✕</button>
            <div className="row align-items-start">
              <div className="col-md-5">
                <Image src={TEAM[teamPopup].img} width={300} height={300} alt={TEAM[teamPopup].name} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
              </div>
              <div className="col-md-7">
                <div className="team-popup-info ps-md-3">
                  <h3 className="team-name title title-lg pt-4">{TEAM[teamPopup].name}</h3>
                  <p className="team-position">{TEAM[teamPopup].role}</p>
                  <ul className="team-social team-social-s2 mb-4">
                    {['facebook-f', 'linkedin-in'].map(icon => (
                      <li key={icon}><a href="#"><em className={`fab fa-${icon}`} /></a></li>
                    ))}
                  </ul>
                  <p>A highly experienced blockchain professional with deep expertise in decentralized systems and cryptocurrency markets.</p>
                  <div className="progress-list" style={{ marginTop: 16 }}>
                    {TEAM[teamPopup].skills.map(skill => (
                      <div key={skill.label} className="progress-wrap" style={{ marginBottom: 12 }}>
                        <div className="progress-title">{skill.label} <span className="progress-amount">{skill.pct}%</span></div>
                        <div className="progress-bar progress-bar-xs bg-black-10">
                          <div className="progress-percent bg-primary" style={{ width: `${skill.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== LOGIN MODAL ===== */}
      {loginModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setLoginModal(false)}
        >
          <div
            className="bg-theme tc-light"
            style={{ width: '100%', maxWidth: 420, borderRadius: 12, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="ath-container m-0">
              <div className="ath-body bg-theme tc-light" style={{ padding: 32, position: 'relative' }}>
                <button onClick={() => setLoginModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', color: 'inherit', fontSize: 20, cursor: 'pointer' }}>✕</button>
                <h5 className="ath-heading title">Sign in <small className="tc-default">with your Flash Exchange Account</small></h5>
                <div className="field-item">
                  <div className="field-wrap">
                    <input type="email" className="input-bordered" placeholder="Your Email" />
                  </div>
                </div>
                <div className="field-item">
                  <div className="field-wrap">
                    <input type="password" className="input-bordered" placeholder="Password" />
                  </div>
                </div>
                <button className="btn btn-primary btn-block btn-md" style={{ width: '100%', border: 'none', cursor: 'pointer' }}>Sign In</button>
                <div className="ath-note text-center" style={{ marginTop: 16 }}>
                  Don&apos;t have an account? <a href="#" onClick={() => setLoginModal(false)}><strong>Sign up here</strong></a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== EXCHANGE MODAL ===== */}
      {showExchange && <ExchangeModal onClose={() => setShowExchange(false)} />}

      {/* Marquee animation */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
