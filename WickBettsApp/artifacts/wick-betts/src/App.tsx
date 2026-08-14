import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import {
  ArrowRight, Award, Bell, BookMarked, BookOpen, CalendarDays, CandlestickChart, Camera, Check,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, Crown, ExternalLink, Filter, Flame,
  Gamepad2, GraduationCap, Heart, Layers, LayoutDashboard, LoaderCircle, LockKeyhole,
  LogOut, MessageCircle, Newspaper, PanelLeft, Pencil, Percent, Plus, Radio, Rocket, RotateCcw,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Star, Swords, Target, TrendingUp, Trophy,
  UserRound, WalletCards, X, Chrome, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiPath } from './lib/api';

const clerkPubKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string) ?? '';
const devAuthMode = (import.meta.env.VITE_DEV_AUTH_MODE as string | undefined)?.trim().toLowerCase();
const isDevAuthMode = devAuthMode === 'localhost' || devAuthMode === 'dev';
// Proxy is only active in production (the API server's clerkProxyMiddleware is a
// no-op in dev). Using it in dev routes Clerk's JS through Express which has no
// handler for /__clerk, producing 500s and a blank sign-in page.
const clerkProxyUrl = import.meta.env.PROD
  ? (import.meta.env.VITE_CLERK_PROXY_URL as string | undefined) || undefined
  : undefined;
type Plan = 'signals' | 'mentorship' | 'membership';
type SignalStatus = 'Active' | 'Watching' | 'Closed' | 'Stopped';
type Direction = 'Long' | 'Short';
type Thread = 'Signals' | 'News' | 'Community Chat';

type Member = {
  name: string; plan: Plan; joinedDate: string; timezone: string; nextBillingDate: string;
  mentorshipEnds: string; weeklyCallsUsed: number;
};
type Signal = {
  id: string; asset: string; market: 'Stocks' | 'Crypto'; direction: Direction; entry: string;
  target: string; stop: string; timeframe: string; risk: string; status: SignalStatus;
  postedAt?: string; createdAt?: string; analysis: string; isOption?: boolean; optionType?: string;
  contract?: string; expiration?: string; strike?: string; premium?: string; bid?: string; ask?: string;
  impliedVolatility?: string; delta?: number; gamma?: number; theta?: number; vega?: number;
  openInterest?: string;
};
type NewsPost = {
  id: string; headline: string; category: string; summary: string; whyItMatters: string;
  affectedAssets: string[]; commentary: string; postedAt: string;
};
type CommunityMessage = {
  id: string; thread: Thread; author: string; text: string; postedAt: string;
  reactions: number; pinned?: boolean;
};
type AppointmentSlot = { id: string; date: string; time: string; duration: string; available: boolean; booked: boolean };

const fallbackSignals: Signal[] = [
  { id:'nvda', asset:'NVDA', market:'Stocks', direction:'Long', entry:'$117.40', target:'$126.80', stop:'$112.15', timeframe:'2–5 days', risk:'Moderate', status:'Active', postedAt:'Today · 07:42', analysis:'The reclaim of the prior weekly shelf matters more than the headline. Watching for breadth to confirm above $119 before adding size.' },
  { id:'btc', asset:'BTC / USD', market:'Crypto', direction:'Long', entry:'$67,240', target:'$71,800', stop:'$64,900', timeframe:'1–2 weeks', risk:'Elevated', status:'Active', postedAt:'Today · 06:58', analysis:'Price is compressing beneath the range high. This is a patient entry, not an invitation to chase a breakout candle.' },
  { id:'shop', asset:'SHOP', market:'Stocks', direction:'Short', entry:'$71.85', target:'$66.20', stop:'$74.70', timeframe:'3–7 days', risk:'Moderate', status:'Watching', postedAt:'Yesterday · 15:11', analysis:'Relative weakness is clean, but we want a failed reclaim of $72 before this becomes actionable.' },
];

const news: NewsPost[] = [
  { id:'rates', headline:'The market is listening for a slower second half', category:'Macro', summary:'Treasury yields eased into the close as traders priced a more measured path for policy.', whyItMatters:'Duration-sensitive sectors may get room to breathe, but the tape still needs earnings breadth.', affectedAssets:['QQQ','IWM','TLT'], commentary:'A softer rate impulse is helpful. It is not, by itself, a reason to abandon risk controls.', postedAt:'Today · 08:18' },
  { id:'btc-etf', headline:'Spot flows return, but conviction is still selective', category:'Digital assets', summary:'The latest flow data shows demand returning to the larger, more liquid vehicles.', whyItMatters:'Liquidity is concentrating. That usually rewards patience and defined levels over broad exposure.', affectedAssets:['BTC','ETH','COIN'], commentary:'Follow where size can actually move. The long tail can wait for confirmation.', postedAt:'Today · 07:11' },
  { id:'semis', headline:'Semiconductors reset after an unusually crowded week', category:'Equities', summary:'Chip names gave back a portion of their recent advance as positioning met a cooler supply-chain read-through.', whyItMatters:'The group remains structurally important, but a better entry can emerge if leaders hold their weekly shelves.', affectedAssets:['NVDA','AMD','SMH'], commentary:'We are interested in the leaders that hold—not the names that simply fall the least.', postedAt:'Yesterday · 16:02' },
  { id:'energy', headline:'Oil holds a narrow range into inventory data', category:'Commodities', summary:'Crude is coiling ahead of the weekly inventory release, keeping inflation sensitivity on the radar.', whyItMatters:'A sharp break could change the rate conversation quickly, especially for small caps.', affectedAssets:['XLE','USO','IWM'], commentary:'Keep this one on the edge of the page, not at the center of the trade plan.', postedAt:'Yesterday · 11:46' },
];

const initialMessages: CommunityMessage[] = [
  { id:'m1', thread:'Signals', author:'Wick Desk', text:'NVDA is active at the opening range level. Keep the sizing modest until the market shows it can hold above the shelf.', postedAt:'Today · 07:45', reactions:12, pinned:true },
  { id:'m2', thread:'Signals', author:'Jon Bell', text:'Appreciate the distinction between an entry and a confirmation. Watching the first fifteen minutes.', postedAt:'Today · 08:02', reactions:6 },
  { id:'m3', thread:'News', author:'Wick Desk', text:'Today\'s rates read is a context update, not a new thesis. Keep the macro tailwind in proportion.', postedAt:'Today · 08:21', reactions:10, pinned:true },
  { id:'m4', thread:'Community Chat', author:'Nora Whitfield', text:'Good morning from London. Anyone else tracking the small-cap breadth divergence?', postedAt:'Today · 06:50', reactions:9 },
  { id:'m5', thread:'Community Chat', author:'Alex Kim', text:'I am. It is the chart I\'m keeping beside the rates complex today.', postedAt:'Today · 07:05', reactions:5 },
];

const slots: AppointmentSlot[] = [
  { id:'s1', date:'Thu, 20 Jun', time:'09:00–10:00', duration:'60 min', available:true, booked:false },
  { id:'s2', date:'Thu, 20 Jun', time:'14:00–15:00', duration:'60 min', available:true, booked:false },
  { id:'s3', date:'Fri, 21 Jun', time:'10:00–11:00', duration:'60 min', available:true, booked:false },
  { id:'s4', date:'Fri, 21 Jun', time:'15:30–16:30', duration:'60 min', available:false, booked:false },
  { id:'s5', date:'Mon, 24 Jun', time:'11:00–12:00', duration:'60 min', available:true, booked:false },
];

const initials = (name: string) => name.split(' ').map((p) => p[0]).join('').slice(0, 2);
const usernameFromUser = (user: { name?: string | null; email?: string | null } | null | undefined) => {
  const emailPrefix = user?.email?.split('@')[0]?.trim();
  return emailPrefix || user?.name?.trim() || 'Member';
};
const navItems = [
  { href:'/app/home', label:'Overview', icon:LayoutDashboard },
  { href:'/app/signals', label:'Signals', icon:Radio },
  { href:'/app/market', label:'Market', icon:TrendingUp },
  { href:'/app/news', label:'Newsroom', icon:Newspaper },
  { href:'/app/learning', label:'Learning', icon:GraduationCap },
  { href:'/app/community', label:'Community', icon:MessageCircle },
  { href:'/app/mentorship', label:'Mentorship', icon:CalendarDays },
  { href:'/app/profile', label:'Profile', icon:UserRound },
];

function Brand() {
  return <span className="brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}wb-logo.png`} alt="Wick Betts logo" /><span className="brand-label">Wick Betts</span></span>;
}

// ── Sign-in / Sign-up pages (Clerk-hosted UI) ─────────────────────────────────
function SignInPage() {
  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
  return (
    <div className="landing app-noise" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <SignIn routing="path" path={`${base}/sign-in`} signUpUrl={`${base}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
  return (
    <div className="landing app-noise" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
      <SignUp routing="path" path={`${base}/sign-up`} signInUrl={`${base}/sign-in`} />
    </div>
  );
}

// ── Sign-In Button ────────────────────────────────────────────────────────────
function SignInButton({ label = 'Sign in', className = '' }: { label?: string; className?: string }) {
  const handleClick = () => {
    const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
    window.location.href = `${base}/sign-in`;
  };
  return (
    <button className={`button button-signin ${className}`} onClick={handleClick} data-testid="button-google-signin">
      <UserRound size={14} style={{ flexShrink: 0 }} />
      {label}
    </button>
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing() {
  const { isAuthenticated, isLoading, startCheckout, subscription } = useAuth();
  const [, setLocation] = useLocation();
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState<Plan | null>(null);

  // Post-checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success' && isAuthenticated) {
      setLocation('/app/home');
    }
  }, [isAuthenticated, setLocation]);

  const handlePlan = async (plan: Plan) => {
    if (!isAuthenticated) {
      const base = (import.meta.env.BASE_URL as string).replace(/\/$/, '');
      window.location.href = `${base}/sign-in`;
      return;
    }
    if (subscription?.status === 'active') {
      setLocation('/app/home');
      return;
    }
    setCheckoutError('');
    setCheckoutLoading(plan);
    try {
      await startCheckout(plan);
    } catch (err) {
      setCheckoutError((err as Error).message);
      setCheckoutLoading(null);
    }
  };

  return <div className="landing app-noise">
    <header className="landing-nav">
      <Brand />
      <div className="nav-kicker">
        {!isLoading && isAuthenticated ? (
          <a href="/app/home" className="button button-dark" style={{ fontSize: 12 }}>Enter desk <ArrowRight size={12} /></a>
        ) : (
          <SignInButton label="Sign in" className="button-nav-signin" />
        )}
      </div>
    </header>
    <main>
      <section className="landing-hero animate-in">
        <span className="eyebrow light">The Wick Betts membership</span>
        <div className="hero-copy">
          <h1>A clearer room<br />before the <em>open.</em></h1>
          <p>Daily signals, market context, and an unhurried place to think. Built for people who take stocks, crypto, and options seriously.</p>
          <div className="hero-actions">
            <button className="button button-primary" data-testid="button-hero-signals" onClick={() => void handlePlan('signals')} disabled={checkoutLoading !== null}>
              {checkoutLoading === 'signals' ? 'Redirecting…' : 'Enter with signals'} <ArrowRight size={14} />
            </button>
            <button className="button button-quiet" data-testid="button-hero-mentorship" onClick={() => void handlePlan('mentorship')} disabled={checkoutLoading !== null}>
              {checkoutLoading === 'mentorship' ? 'Redirecting…' : 'Explore mentorship'}
            </button>
            <button className="button button-quiet" data-testid="button-hero-membership" onClick={() => void handlePlan('membership')} disabled={checkoutLoading !== null}>
              {checkoutLoading === 'membership' ? 'Redirecting…' : 'Unlock membership'}
            </button>
          </div>
          {checkoutError ? <p className="checkout-error">{checkoutError}</p> : null}
        </div>
        <div className="hero-orbit" /><div className="hero-spark" /><span className="hero-index mono">01 / 04 — OPENING NOTE</span>
      </section>
      <section className="landing-intro">
        <h2>Less noise.<br /><em>Better questions.</em></h2>
        <div className="landing-intro-copy">
          <p>Wick Betts is a private briefing room for the moments when headlines get loud and the useful signal gets quiet. We publish levels, not predictions; context, not certainty.</p>
          <span className="eyebrow">A considered view of the tape</span>
        </div>
      </section>
      <section className="signal-strip">
        <div className="strip-head"><div><span className="eyebrow">The morning board</span><h3>What is on the desk</h3></div><span>Illustrative market context · 08:30 ET</span></div>
        <div className="ticker-row">
          <div className="ticker"><strong>NVDA</strong><span className="positive">+1.84% · Holding shelf</span></div>
          <div className="ticker"><strong>BTC / USD</strong><span className="positive">+0.72% · Range high</span></div>
          <div className="ticker"><strong>QQQ</strong><span className="negative">−0.31% · Watching rates</span></div>
          <div className="ticker"><strong>ETH / USD</strong><span className="negative">−0.46% · Thin liquidity</span></div>
        </div>
      </section>
      <section className="plans-section">
        <div className="plans-wrap">
          <div className="plans-title"><span className="eyebrow">Choose your access</span><h2>Show up with a plan.</h2></div>
          <div className="plan-grid">
            <article className="plan-card animate-in delay-1">
              <span className="eyebrow">The daily desk</span><h3>Signals</h3>
              <div className="price">$250 <small>/ month</small></div>
              <p className="plan-detail">A focused stream of stock, crypto, and options setups with the reasoning — and Greeks — that make a level useful.</p>
              <ul className="plan-list"><li>Daily long and short signals</li><li>Options contracts with full Greeks</li><li>Signal history and status changes</li><li>Market news with Wick commentary</li><li>Private community threads</li></ul>
              <button className="button button-dark" data-testid="button-plan-signals" onClick={() => void handlePlan('signals')} disabled={checkoutLoading !== null}>
                {checkoutLoading === 'signals' ? 'Redirecting…' : 'Join the daily desk'} <ArrowRight size={14} />
              </button>
            </article>
            <article className="plan-card featured animate-in delay-2">
              <span className="plan-tag">Limited access</span><span className="eyebrow light">The closer room</span><h3>Mentorship</h3>
              <div className="price">$500 <small>/ month</small></div>
              <p className="plan-detail">Everything in Signals, plus one calm hour each week to pressure-test your process with a Wick mentor.</p>
              <ul className="plan-list"><li>All daily signals with full Greeks</li><li>Options contract analysis</li><li>Weekly one-hour private call</li><li>Live calendar booking</li><li>Process review and trade journaling</li></ul>
              <button className="button button-primary" data-testid="button-plan-mentorship" onClick={() => void handlePlan('mentorship')} disabled={checkoutLoading !== null}>
                {checkoutLoading === 'mentorship' ? 'Redirecting…' : 'Enter the closer room'} <ArrowRight size={14} />
              </button>
            </article>
            <article className="plan-card animate-in delay-3">
              <span className="eyebrow">The full membership</span><h3>Membership</h3>
              <div className="price">Premium <small>/ month</small></div>
              <p className="plan-detail">A complete member path for desks that want broad platform access in one subscription.</p>
              <ul className="plan-list"><li>Unified member subscription</li><li>Checkout and billing portal access</li><li>Subscription status syncing via webhooks</li><li>Protected desk access after activation</li><li>Same secure Stripe checkout flow</li></ul>
              <button className="button button-dark" data-testid="button-plan-membership" onClick={() => void handlePlan('membership')} disabled={checkoutLoading !== null}>
                {checkoutLoading === 'membership' ? 'Redirecting…' : 'Join membership'} <ArrowRight size={14} />
              </button>
            </article>
          </div>
          <div className="payment-badges">
            <span className="payment-badge">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 6h12" stroke="currentColor" strokeWidth="1.2"/></svg>
              Card
            </span>
            <span className="payment-badge">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.5C4 1.5 2 4 2 7s2 5.5 5 5.5 5-2.5 5-5.5-2-5.5-5-5.5z" stroke="currentColor" strokeWidth="1.2"/><path d="M5 7.5c.5 1.5 1.5 2 2 2s1.5-.5 2-2c-.5-.5-1-.7-2-.7S5.5 7 5 7.5z" fill="currentColor"/></svg>
              Apple Pay
            </span>
            <span className="payment-badge">
              <Chrome size={12} />
              Google Pay
            </span>
            <span className="payment-badge">
              <ShieldCheck size={12} />
              Secured by Stripe
            </span>
          </div>
        </div>
      </section>
    </main>
    <footer className="landing-footer">
      <span>Educational market intelligence · Not investment advice</span>
      <span>© 2026 Wick Betts</span>
    </footer>
  </div>;
}

function SubscriptionLapsedScreen() {
  const { user, subscription, openBillingPortal, startCheckout, logout } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  const status = subscription?.status ?? 'canceled';
  const isPastDue = status === 'past_due';
  const plan = subscription?.plan ?? 'signals';
  // Use the user-level flag (already in AuthUser) rather than reading stripeCustomerId
  // from the subscription object, which is not part of the client Subscription type.
  const hasStripeCustomer = user?.hasStripeCustomer ?? false;

  const handleBillingPortal = async () => {
    setError('');
    setPortalLoading(true);
    try { await openBillingPortal(); }
    catch (err) { setError((err as Error).message); }
    finally { setPortalLoading(false); }
  };

  const handleResubscribe = async () => {
    setError('');
    setCheckoutLoading(true);
    try { await startCheckout(plan); }
    catch (err) { setError((err as Error).message); }
    finally { setCheckoutLoading(false); }
  };

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 24, padding: 32, textAlign: 'center' }}>
      <div className="loading-mark">W</div>
      <div style={{ maxWidth: 400 }}>
        <h2 style={{ marginBottom: 8 }}>
          {isPastDue ? 'Payment past due' : 'Your membership has lapsed'}
        </h2>
        <p className="muted" style={{ lineHeight: 1.6, marginBottom: 24 }}>
          {isPastDue
            ? "Your last payment didn't go through. Update your payment method to restore access immediately."
            : 'Your subscription is no longer active. Re-subscribe below to get back into the desk.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {hasStripeCustomer && (
            <button
              className="button button-dark"
              onClick={() => void handleBillingPortal()}
              disabled={portalLoading}
            >
              <CreditCard size={13} />
              {portalLoading ? 'Loading…' : isPastDue ? 'Update payment method' : 'Manage billing'}
            </button>
          )}
          {!isPastDue && (
            <button
              className="button button-outline"
              onClick={() => void handleResubscribe()}
              disabled={checkoutLoading}
            >
              <ArrowRight size={13} />
              {checkoutLoading ? 'Loading…' : 'Re-subscribe'}
            </button>
          )}
          <button className="button button-outline" onClick={() => void logout()}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
        {error && <p className="checkout-error" style={{ marginTop: 14 }}>{error}</p>}
      </div>
    </div>
  );
}

const GRACE_PERIOD_DAYS = 5;
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, subscription } = useAuth();
  const [location, setLocation] = useLocation();
  const isDevAuthMode = (import.meta.env.VITE_DEV_AUTH_MODE as string | undefined)?.trim().toLowerCase() === 'localhost'
    || (import.meta.env.VITE_DEV_AUTH_MODE as string | undefined)?.trim().toLowerCase() === 'dev';

  // Admins get full access regardless of subscription state — mirrors the
  // `role !== 'admin'` bypass already enforced on every gated API route
  // (community, mentorship, signals). Without this, an admin account with
  // no Stripe subscription of its own gets bounced back to the landing
  // page on every visit and never reaches the app shell at all.
  const isAdmin = user?.role === 'admin';

  // Only unauthenticated visitors get bounced to the landing page. Members
  // who have never subscribed (subscription === null) are still let into
  // the app shell — Community and Profile stay open to them, while
  // RequireSubscription locks the paid rooms (Home, Signals, Market, News)
  // behind an upsell panel instead of denying access to the whole app.
  const shouldRedirect = !isLoading && !isAuthenticated;

  useEffect(() => {
    if (isDevAuthMode) return;
    // Guard on current location to avoid a pushState loop while unmounting
    if (shouldRedirect && location !== '/') setLocation('/');
  }, [isDevAuthMode, shouldRedirect, location, setLocation]);

  // isLoading covers both Clerk initialization and data fetch in-flight
  if (isLoading) return <div className="loading-screen"><div className="loading-mark">W</div></div>;
  if (!isAuthenticated) return null;

  // null here means the fetch completed and confirmed the member has never
  // subscribed — let them through; RequireSubscription gates the paid rooms.
  if (subscription === null) return <>{children}</>;

  // Determine whether the subscription allows access — mirrors requireActiveSubscription on the API:
  //   - active or trialing: full access
  //   - past_due within 5 days of currentPeriodEnd: grace period, let through
  //   - everything else (canceled, incomplete, past_due after grace): show recovery screen
  const hasAccess =
    isAdmin ||
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    isWithinGracePeriod(subscription);

  if (!hasAccess) return <SubscriptionLapsedScreen />;

  return <>{children}</>;
}

/**
 * Route-level paywall for members with no subscription at all
 * (subscription === null). Used to restrict Home, Signals, Market, and News
 * to paying members / admins while still letting unsubscribed members reach
 * Community and Profile (handled by not wrapping those routes with this).
 */
function RequireSubscription({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const { user, subscription } = useAuth();
  const isAdmin = user?.role === 'admin';
  if (!isAdmin && subscription === null) {
    return <div className="page"><NoSubscriptionGate title={title} description={description} /></div>;
  }
  return <>{children}</>;
}

function NoSubscriptionGate({ title, description }: { title: string; description: string }) {
  const { startCheckout } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');

  const choose = async (plan: Plan) => {
    setError('');
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
    } catch (err) {
      setError((err as Error).message);
      setLoadingPlan(null);
    }
  };

  return (
    <div className="locked-panel animate-in">
      <LockKeyhole size={18} />
      <h3>{title}</h3>
      <p>{description}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="button button-dark" onClick={() => void choose('signals')} disabled={loadingPlan !== null}>
          {loadingPlan === 'signals' ? 'Redirecting…' : 'Join Signals · $250/mo'}
        </button>
        <button className="button button-outline" onClick={() => void choose('mentorship')} disabled={loadingPlan !== null}>
          {loadingPlan === 'mentorship' ? 'Redirecting…' : 'Mentorship · $500/mo'}
        </button>
        <button className="button button-outline" onClick={() => void choose('membership')} disabled={loadingPlan !== null}>
          {loadingPlan === 'membership' ? 'Redirecting…' : 'Membership'}
        </button>
      </div>
      {error && <p className="checkout-error" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}

// ── Member Shell ──────────────────────────────────────────────────────────────
// Tabs that stay open to authenticated members even with no subscription —
// everything else requires an active plan (see RequireSubscription / the
// Mentorship page's own plan check).
const FREE_NAV_HREFS = new Set(['/app/community', '/app/profile']);

function MemberShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, subscription, logout } = useAuth();
  const active = (href: string) => location === href;
  const memberName = usernameFromUser(user);
  const plan = subscription?.plan ?? 'signals';
  const isAdmin = user?.role === 'admin';
  const [sidebarAvatarBroken, setSidebarAvatarBroken] = useState(false);
  const [topbarAvatarBroken, setTopbarAvatarBroken] = useState(false);
  useEffect(() => { setSidebarAvatarBroken(false); setTopbarAvatarBroken(false); }, [user?.avatarUrl]);
  const visibleNavItems = (isAdmin || subscription !== null)
    ? navItems
    : navItems.filter((item) => FREE_NAV_HREFS.has(item.href));

  return <div className="member-shell app-noise">
    <aside className="sidebar">
      <Brand />
      <div className="member-note">
        <span className="eyebrow light">Your private desk</span>
        <p>Good morning,<br /><em>{memberName.split(' ')[0]}.</em></p>
      </div>
      <nav className="member-nav">
        {visibleNavItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={active(href) ? 'active' : ''} data-testid={`link-${label.toLowerCase().replace(' ', '-')}`}>
            <Icon />{label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="member-badge">
          {user?.avatarUrl && !sidebarAvatarBroken
            ? <img src={user.avatarUrl} alt={memberName} className="avatar-img" referrerPolicy="no-referrer" onError={() => setSidebarAvatarBroken(true)} />
            : <span className="avatar">{initials(memberName)}</span>
          }
          <div><strong>{memberName}</strong><span>{plan === 'mentorship' ? 'Mentorship member' : plan === 'membership' ? 'Membership member' : 'Signals member'}</span></div>
        </div>
        <button className="sidebar-logout" onClick={() => void logout()} title="Sign out">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <Link href="/app/home" className="mobile-brand"><Brand /></Link>
        <span className="date">Wick Betts · {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</span>
        <div className="topbar-actions">
          <Link href="/app/profile" className="icon-button" title="Profile" data-testid="button-help">
            <CircleHelp size={15} />
          </Link>
          <Link href="/app/profile" className="icon-button" title="Profile" data-testid="link-top-profile">
            {user?.avatarUrl && !topbarAvatarBroken
              ? <img src={user.avatarUrl} alt="" className="avatar-img avatar-img--sm" referrerPolicy="no-referrer" onError={() => setTopbarAvatarBroken(true)} />
              : <UserRound size={15} />
            }
          </Link>
        </div>
      </header>
      {children}
    </main>
    <nav className="mobile-nav">
      {visibleNavItems.slice(0, 5).map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={active(href) ? 'active' : ''} data-testid={`mobile-link-${label.toLowerCase().replace(' ', '-')}`}>
          <Icon /><span>{label === 'Overview' ? 'Home' : label}</span>
        </Link>
      ))}
    </nav>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div><div>{description && <p>{description}</p>}{action}</div></div>;
}

// ── Home ──────────────────────────────────────────────────────────────────────
function HomePage() {
  const { user, subscription } = useAuth();
  const plan = subscription?.plan ?? 'signals';
  const memberName = usernameFromUser(user);

  return <div className="page">
    <PageHeading eyebrow={new Date().toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'})} title="Your morning brief." description="A short read on what changed, what matters, and where patience is still the better position." />
    <div className="dashboard-grid animate-in">
      <section className="surface surface-dark brief-card">
        <span className="eyebrow light">Today's brief · 08:30 ET</span>
        <h2>Risk is awake.<br /><em>Stay selective.</em></h2>
        <p>Rates are giving growth a little room, but breadth is not yet doing the work. Our desk is focused on leaders holding clean levels—not on adding exposure for its own sake.</p>
        <div className="brief-foot"><span className="live-dot" /> Briefing read · 4 min <span>↗</span></div>
      </section>
      <section className="surface snapshot">
        <div className="section-head"><div><span className="eyebrow">At a glance</span><h3>Active desk</h3></div><Link href="/app/signals" className="link-arrow" data-testid="link-view-signals">View all</Link></div>
        <div className="snapshot-list">
          {fallbackSignals.filter((s) => s.status === 'Active').map((signal) => (
            <div className="snapshot-line" key={signal.id}>
              <div><strong>{signal.asset}</strong><span>{signal.direction} · {signal.timeframe}</span></div>
              <div className="snapshot-price"><span className="status-pill status-active">{signal.status}</span><br />{signal.entry}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
    <div className="lower-grid">
      <section className="surface section-card animate-in delay-1">
        <div className="section-head"><div><span className="eyebrow">From the newsroom</span><h3>Worth your attention</h3></div><Link href="/app/news" className="link-arrow" data-testid="link-view-news">All news</Link></div>
        {news.slice(0,2).map((item) => <article className="news-item" key={item.id}><span className="news-meta">{item.category} · {item.postedAt}</span><h4>{item.headline}</h4><p>{item.summary}</p></article>)}
      </section>
      <section className="surface section-card animate-in delay-2">
        <div className="section-head"><div><span className="eyebrow">The room</span><h3>Community pulse</h3></div><Link href="/app/community" className="link-arrow" data-testid="link-view-community">Join in</Link></div>
        <div className="community-pulse">
          {initialMessages.filter((m) => m.thread === 'Community Chat').map((message) => (
            <div className="pulse-row" key={message.id}><span className="avatar">{initials(message.author)}</span><p>{message.text}<span>{message.author} · {message.postedAt}</span></p></div>
          ))}
        </div>
      </section>
    </div>
    {plan === 'mentorship' && <section className="mentorship-reminder animate-in delay-3"><div><span className="eyebrow">Your weekly hour</span><h3>A room is waiting for you.</h3><p>Book one of four calls available this cycle.</p></div><Link href="/app/mentorship" className="button button-dark" data-testid="link-book-mentorship">Book a call <ArrowRight size={14} /></Link></section>}
  </div>;
}

// ── Signals ───────────────────────────────────────────────────────────────────
function SignalsPage() {
  const { getToken, openBillingPortal, startCheckout, subscription } = useAuth();
  const [market, setMarket] = useState<'All' | 'Stocks' | 'Crypto'>('All');
  const [status, setStatus] = useState<'All' | SignalStatus>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Start empty — never pre-populate with bundled data so lapsed users see no paid content.
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loadError, setLoadError] = useState('');
  const [subRequired, setSubRequired] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const r = await fetch(apiPath('/signals'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (r.status === 403) {
          const body = await r.json() as { code?: string };
          if (body.code === 'SUBSCRIPTION_REQUIRED') {
            setSubRequired(true);
            setSignals([]);
            return;
          }
        }
        if (!r.ok) { setLoadError('Unable to load signals. Please try again shortly.'); return; }
        const data = await r.json() as { signals: Signal[] };
        setSignals(data.signals ?? []);
      } catch {
        setLoadError('Unable to load signals. Please try again shortly.');
      }
    })();
  }, [getToken]);

  if (subRequired) {
    const isPastDue = subscription?.status === 'past_due';
    return <div className="page">
      <PageHeading eyebrow="The daily desk" title="Signals." />
      <div className="surface animate-in" style={{ padding: 40, textAlign: 'center' }}>
        <LockKeyhole size={28} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
        <h3 style={{ marginBottom: 8 }}>{isPastDue ? 'Payment past due' : 'Membership required'}</h3>
        <p className="muted" style={{ maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>
          {isPastDue
            ? "Your last payment didn't go through. Update your payment method to restore access."
            : 'An active subscription is required to view signals.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="button button-dark" onClick={() => void openBillingPortal()}>
            <CreditCard size={13} /> {isPastDue ? 'Update payment method' : 'Manage billing'}
          </button>
          {!isPastDue && (
            <button className="button button-outline" onClick={() => void startCheckout(subscription?.plan ?? 'signals')}>
              <ArrowRight size={13} /> Re-subscribe
            </button>
          )}
        </div>
      </div>
    </div>;
  }

  const visible = signals.filter((s) =>
    (market === 'All' || s.market === market) && (status === 'All' || s.status === status)
  );

  return <div className="page">
    <PageHeading eyebrow="The daily desk" title="Signals." description="Defined levels with a clear invalidation. Stocks, crypto, and options — with Greeks where they matter." />
    {loadError ? <p className="muted tiny" style={{marginBottom:8}}>{loadError}</p> : null}
    <div className="filter-bar">
      <Filter size={14} color="var(--muted)" />
      <button className={`filter-chip ${market === 'All' ? 'selected' : ''}`} onClick={() => setMarket('All')} data-testid="filter-market-all">All markets</button>
      {(['Stocks','Crypto'] as const).map((m) => <button key={m} className={`filter-chip ${market === m ? 'selected' : ''}`} onClick={() => setMarket(m)} data-testid={`filter-market-${m.toLowerCase()}`}>{m}</button>)}
      <span style={{ width:8 }} />
      <button className={`filter-chip ${status === 'All' ? 'selected' : ''}`} onClick={() => setStatus('All')} data-testid="filter-status-all">Any status</button>
      {(['Active','Watching','Closed','Stopped'] as SignalStatus[]).map((s) => <button key={s} className={`filter-chip ${status === s ? 'selected' : ''}`} onClick={() => setStatus(s)} data-testid={`filter-status-${s.toLowerCase()}`}>{s}</button>)}
    </div>
    <div className="surface signal-table animate-in">
      <div className="table-row table-head"><span>Asset</span><span>Direction</span><span>Entry</span><span>Target</span><span>Stop</span><span>Risk</span></div>
      {visible.length ? visible.map((signal) => (
        <div key={signal.id} className={`table-row clickable ${expanded === signal.id ? 'expanded' : ''}`} onClick={() => setExpanded(expanded === signal.id ? null : signal.id)} data-testid={`row-signal-${signal.id}`}>
          <div className="asset-name">
            <strong>{signal.asset}</strong>
            {signal.isOption && <span className="option-tag">{signal.optionType} · {signal.strike}</span>}
            <span>{signal.market} · {signal.postedAt}</span>
          </div>
          <span className={`direction ${signal.direction.toLowerCase()}`}>{signal.direction}</span>
          <span className="signal-cell"><small>{signal.isOption ? 'Debit' : 'Entry'}</small>{signal.entry}</span>
          <span className="signal-cell"><small>Target</small>{signal.target}</span>
          <span className="signal-cell"><small>Stop</small>{signal.stop}</span>
          <span className="signal-cell"><span className={`status-pill status-${signal.status.toLowerCase()}`}>{signal.status}</span></span>
          {expanded === signal.id && (
            <div className="signal-expand">
              {signal.isOption && (
                <div className="greeks-row">
                  <span className="greeks-label">IV {signal.impliedVolatility}</span>
                  <span>Δ {signal.delta?.toFixed(2)}</span>
                  <span>Γ {signal.gamma?.toFixed(3)}</span>
                  <span>Θ {signal.theta?.toFixed(2)}</span>
                  <span>V {signal.vega?.toFixed(2)}</span>
                  {signal.contract && <span className="mono">{signal.contract}</span>}
                </div>
              )}
              <p className="signal-analysis">{signal.analysis}</p>
            </div>
          )}
        </div>
      )) : <div className="empty-state"><Radio size={25} /><h3>No matching signals</h3><p>Try widening the market or status filter.</p></div>}
    </div>
    <p className="table-note">All signals are educational market intelligence, not a recommendation or promise of outcome.</p>
  </div>;
}

// ── Market ────────────────────────────────────────────────────────────────────
interface QuoteItem {
  symbol: string; shortName: string; price: number; change: number;
  changePercent: number; volume: number; avgVolume: number;
  marketCap: number | null; group: string; currency: string;
}

const GROUPS: { key: string; label: string }[] = [
  { key: 'indices', label: 'Indices & ETFs' },
  { key: 'megacap', label: 'Mega-cap tech' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'sectors', label: 'Sector heat' },
  { key: 'finance', label: 'Finance' },
  { key: 'macro', label: 'Macro & bonds' },
];

function heatBg(pct: number): string {
  if (pct >= 1.5) return '#0D3322';
  if (pct >= 0.5) return '#13281C';
  if (pct >= -0.5) return '#1A1A2E';
  if (pct >= -1.5) return '#2D0F0F';
  return '#3D0808';
}
function heatText(pct: number): string {
  if (pct >= 0.5) return '#7AE2AA';
  if (pct >= -0.5) return 'var(--muted)';
  return '#FB7185';
}
function fmt(price: number, sym: string): string {
  if (sym === 'BTC-USD') return `$${Math.round(price).toLocaleString()}`;
  if (sym === 'ETH-USD') return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (sym.includes('^')) return price.toFixed(2);
  return `$${price.toFixed(2)}`;
}

function MarketPage() {
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);

  const { getToken: getMarketToken } = useAuth();
  const load = useCallback(async () => {
    try {
      const token = await getMarketToken();
      const r = await fetch(apiPath('/market/quotes'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) return;
      const d = await r.json() as { quotes: QuoteItem[]; fetchedAt: number; stale?: boolean };
      setQuotes(d.quotes);
      setFetchedAt(d.fetchedAt);
      setStale(!!d.stale);
    } catch { /* keep previous */ }
    finally { setLoading(false); }
  }, [getMarketToken]);

  useEffect(() => { void load(); const id = setInterval(() => void load(), 60_000); return () => clearInterval(id); }, [load]);

  const byGroup = (key: string) => quotes.filter((q) => q.group === key);
  const indices = byGroup('indices');
  const spyQ = indices.find((q) => q.symbol === 'SPY');
  const qqqQ = indices.find((q) => q.symbol === 'QQQ');
  const vixQ = indices.find((q) => q.symbol === '^VIX');

  return <div className="page">
    <PageHeading eyebrow="Market overview" title="The board." description="Delayed quotes across indices, sectors, mega-caps, and crypto. Data sourced from Yahoo Finance — 15 min delayed." />

    {/* Index summary bar */}
    <div className="market-summary-bar animate-in">
      {[spyQ, qqqQ, vixQ].filter(Boolean).map((q) => q && (
        <div key={q.symbol} className="market-summary-cell">
          <span className="market-summary-label">{q.symbol.replace('^','')}</span>
          <span className="market-summary-price">{fmt(q.price, q.symbol)}</span>
          <span className="market-summary-chg" style={{ color: heatText(q.changePercent) }}>
            {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
          </span>
        </div>
      ))}
      {fetchedAt && (
        <div className="market-summary-cell market-summary-meta">
          <span className="market-summary-label">Updated</span>
          <span className="market-summary-price">{new Date(fetchedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
          <span className="market-summary-chg" style={{color:'var(--muted)'}}>15 min delay{stale ? ' · cached' : ''}</span>
        </div>
      )}
    </div>

    {loading && quotes.length === 0 && (
      <div className="empty-state" style={{paddingTop:60}}>
        <TrendingUp size={24} />
        <h3>Pulling market data…</h3>
        <p>Fetching delayed quotes from Yahoo Finance.</p>
      </div>
    )}

    {GROUPS.map(({ key, label }) => {
      const group = byGroup(key);
      if (!group.length) return null;
      return (
        <section key={key} className="market-group animate-in">
          <span className="eyebrow" style={{marginBottom:12,display:'block'}}>{label}</span>
          <div className="heat-grid">
            {group.map((q) => (
              <div key={q.symbol} className="heat-cell" style={{ background: heatBg(q.changePercent), borderColor: 'var(--border)' }}>
                <span className="heat-ticker">{q.symbol.replace('-USD','').replace('^','')}</span>
                <span className="heat-price">{fmt(q.price, q.symbol)}</span>
                <span className="heat-pct" style={{ color: heatText(q.changePercent) }}>
                  {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      );
    })}
    <p className="table-note" style={{marginTop:24}}>Data provided by Yahoo Finance (15-min delayed). Not a recommendation. Educational context only.</p>
  </div>;
}

// ── News ──────────────────────────────────────────────────────────────────────
interface LiveArticle {
  id: string; headline: string; source: string; url: string;
  publishedAt: string; category: string; summary: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsPage() {
  const { getToken: getNewsToken } = useAuth();
  const [articles, setArticles] = useState<LiveArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LiveArticle | null>(null);
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getNewsToken();
        const r = await fetch(apiPath('/news/feed'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) return;
        const d = await r.json() as { articles: LiveArticle[] };
        setArticles(d.articles);
      } catch {
        /* keep empty state */
      } finally {
        setLoading(false);
      }
    })();
  }, [getNewsToken]);

  return <div className="page">
    <PageHeading eyebrow="The newsroom" title="Live headlines." description="Scraped every 5 minutes from Yahoo Finance, CNBC, and WSJ. The signal, without the noise." />
    {loading && <div className="empty-state" style={{paddingTop:40}}><Newspaper size={22}/><h3>Pulling headlines…</h3></div>}
    <div className="news-layout">
      <section className="surface news-feed animate-in">
        {articles.map((item) => (
          <article key={item.id} className="news-feed-item" onClick={() => { setSelected(item); if (!read.includes(item.id)) setRead([...read, item.id]); }} data-testid={`article-news-${item.id}`}>
            <span className="eyebrow">{item.category} · {timeAgo(item.publishedAt)}</span>
            <span className="read-state">{read.includes(item.id) ? 'Read' : 'Open'}</span>
            <h2>{item.headline}</h2>
            <p>{item.summary}</p>
            <div className="news-tags">
              <span className="asset-tag">{item.source}</span>
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="asset-tag" onClick={(e) => e.stopPropagation()} style={{textDecoration:'none'}}>↗ Source</a>}
            </div>
          </article>
        ))}
        {!loading && articles.length === 0 && (
          <div className="empty-state"><Newspaper size={22}/><h3>No articles loaded</h3><p>RSS sources may be temporarily unavailable. Check back shortly.</p></div>
        )}
      </section>
      <aside className="surface news-aside animate-in delay-1">
        <span className="eyebrow">Selected story</span>
        <h3>{selected ? selected.headline : 'Select a story.'}</h3>
        {selected ? (
          <>
            <p className="muted tiny" style={{marginTop:10}}>{selected.summary}</p>
            <div className="commentary-box" style={{marginTop:18}}>
              <span className="eyebrow">Source</span>
              <p>{selected.source} · {timeAgo(selected.publishedAt)}</p>
              {selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" className="button button-outline" style={{marginTop:14,display:'inline-flex',gap:6,fontSize:12}}><ExternalLink size={12}/> Read full article</a>}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{padding:'42px 10px',border:0}}>
            <BookOpen size={22}/><p style={{marginTop:12}}>Open any story to read the full headline and visit the source.</p>
          </div>
        )}
      </aside>
    </div>
    <p className="table-note" style={{marginTop:16}}>Data sourced from public RSS feeds (Yahoo Finance, CNBC, WSJ). Updated every 5 min. Not investment advice.</p>
  </div>;
}

// ── Community ──────────────────────────────────────────────────────────────────
interface CommunityPost {
  id: string;
  thread: Thread;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
}

function communityTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CommunityPage() {
  const { getToken, user } = useAuth();
  const [thread, setThread] = useState<Thread>('Signals');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [reacted, setReacted] = useState<string[]>([]);
  const threadCopy: Record<Thread,string> = { Signals:'Levels, entries, and the discipline around a setup.', News:'The macro and company context behind today\'s board.', 'Community Chat':'A considered place to compare notes with other members.' };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/community'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) { setLoadError('Could not load messages. Please try again.'); return; }
      const data = await r.json() as { posts: CommunityPost[] };
      // API returns newest-first; reverse so newest renders at the bottom.
      setPosts((data.posts ?? []).slice().reverse());
    } catch {
      setLoadError('Could not load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void fetchPosts(); }, [fetchPosts]);

  const current = posts.filter((p) => p.thread === thread);

  const post = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setText('');
    setSendError('');
    setSending(true);

    const optimistic: CommunityPost = {
      id: `optimistic-${Date.now()}`,
      thread: 'Community Chat',
      text: value,
      createdAt: new Date().toISOString(),
      authorId: user?.id ?? '',
      authorName: user?.name ?? 'You',
    };
    setPosts((prev) => [...prev, optimistic]);
    setThread('Community Chat');

    try {
      const token = await getToken();
      const r = await fetch(apiPath('/community'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ thread: 'Community Chat', text: value }),
      });
      if (!r.ok) throw new Error('Failed');
      const data = await r.json() as { post: CommunityPost };
      setPosts((prev) => prev.map((p) => (p.id === optimistic.id ? data.post : p)));
    } catch {
      setPosts((prev) => prev.filter((p) => p.id !== optimistic.id));
      setText(value);
      setSendError('Could not post your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return <div className="page"><PageHeading eyebrow="The room" title="Community." description="Three official threads. No feed to scroll forever." />
    <section className="surface animate-in">
      <div className="thread-tabs">{(['Signals','News','Community Chat'] as Thread[]).map((name) => <button key={name} className={`thread-tab ${thread === name ? 'active' : ''}`} onClick={() => setThread(name)} data-testid={`tab-thread-${name.toLowerCase().replace(' ','-')}`}>{name}</button>)}</div>
      <p className="thread-description">{threadCopy[thread]}</p>
      {loading ? (
        <div className="empty-state"><MessageCircle size={22} /><h3>Loading messages…</h3></div>
      ) : loadError ? (
        <div className="empty-state">
          <MessageCircle size={22} />
          <h3>Something went wrong</h3>
          <p>{loadError}</p>
          <button className="button button-dark" style={{ marginTop: 16 }} onClick={() => void fetchPosts()} data-testid="button-retry-community">Try again</button>
        </div>
      ) : current.length === 0 ? (
        <div className="empty-state"><MessageCircle size={22} /><h3>No messages yet</h3><p>Nothing in {thread} so far.</p></div>
      ) : (
        <div className="messages">{current.map((message) => {
          const author = message.authorName ?? 'Member';
          return (
            <article className="message" key={message.id}>
              <div className="message-top">
                <div className="author"><span className="avatar">{initials(author)}</span><div><strong>{author}</strong><span>{communityTime(message.createdAt)}</span></div></div>
              </div>
              <p className="message-text">{message.text}</p>
              <div className="message-bottom">
                <button className={`reaction ${reacted.includes(message.id) ? 'reacted' : ''}`} onClick={() => setReacted(reacted.includes(message.id) ? reacted.filter((id) => id !== message.id) : [...reacted, message.id])} data-testid={`button-react-message-${message.id}`}><Heart size={11} /> {reacted.includes(message.id) ? 1 : 0}</button>
              </div>
            </article>
          );
        })}</div>
      )}
      {thread === 'Community Chat' && (
        <div className="composer">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add to Community Chat…" disabled={sending} data-testid="input-community-composer" />
          {sendError && <p className="checkout-error" style={{ marginTop: 8 }}>{sendError}</p>}
          <div className="composer-footer">
            <span>Keep it useful. Keep it human.</span>
            <button className="button button-primary" onClick={() => void post()} disabled={!text.trim() || sending} data-testid="button-post-community">{sending ? 'Posting…' : <>Post note <ArrowRight size={13} /></>}</button>
          </div>
        </div>
      )}
    </section>
  </div>;
}

// ── Learning: types & progress storage ──────────────────────────────────────────
type LearningLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
const LEARNING_LEVELS: LearningLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

interface LearningModule {
  id: string;
  level: LearningLevel;
  kind: 'lesson' | 'game';
  title: string;
  tagline: string;
  minutes: number;
  xp: number;
  icon: LucideIcon;
  body?: () => React.ReactNode;
}

interface LearningProgress {
  completedModules: string[];
  xp: number;
  streakDays: number;
  lastVisit: string | null;
  candleGame: { bestScore: number; bestStreak: number; plays: number };
  triviaGame: { bestScore: number; plays: number };
}

const LEARNING_STORAGE_PREFIX = 'wb-learning-progress';

function blankLearningProgress(): LearningProgress {
  return {
    completedModules: [],
    xp: 0,
    streakDays: 0,
    lastVisit: null,
    candleGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    triviaGame: { bestScore: 0, plays: 0 },
  };
}

function loadLearningProgress(userId: string | undefined): LearningProgress {
  const fallback = blankLearningProgress();
  if (!userId || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(`${LEARNING_STORAGE_PREFIX}:${userId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      ...fallback,
      ...parsed,
      candleGame: { ...fallback.candleGame, ...parsed.candleGame },
      triviaGame: { ...fallback.triviaGame, ...parsed.triviaGame },
    };
  } catch {
    return fallback;
  }
}

function saveLearningProgress(userId: string | undefined, progress: LearningProgress) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${LEARNING_STORAGE_PREFIX}:${userId}`, JSON.stringify(progress));
  } catch {
    // Storage may be unavailable (private mode, quota) — progress just will not persist.
  }
}

const XP_PER_LEVEL = 200;
function levelFromXp(xp: number): { level: number; intoLevel: number; forNext: number } {
  const level = 1 + Math.floor(xp / XP_PER_LEVEL);
  const intoLevel = xp % XP_PER_LEVEL;
  return { level, intoLevel, forNext: XP_PER_LEVEL };
}

function shuffleArr<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
  }
  return copy;
}
function sampleArr<T>(arr: T[], n: number): T[] { return shuffleArr(arr).slice(0, Math.min(n, arr.length)); }

// ── Learning: candlestick data + glyph renderer ──────────────────────────────────
interface CandleSpec { bodyTop: number; bodyBottom: number; wickTop: number; wickBottom: number; bullish: boolean }
interface CandlePattern {
  id: string;
  name: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  role: string;
  meaning: string;
  candles: CandleSpec[];
}

const CANDLE_PATTERNS: CandlePattern[] = [
  { id: 'doji', name: 'Doji', bias: 'Neutral', role: 'Indecision', meaning: "Open and close land almost on top of each other. Neither side won the session — often a pause before the next move, especially after a strong trend.", candles: [{ bodyTop: 48, bodyBottom: 52, wickTop: 8, wickBottom: 92, bullish: true }] },
  { id: 'hammer', name: 'Hammer', bias: 'Bullish', role: 'Reversal (after a downtrend)', meaning: "A small body sits near the top with a long lower wick. Sellers pushed price down hard, but buyers stepped in and drove it back up — a possible bottom.", candles: [{ bodyTop: 14, bodyBottom: 34, wickTop: 8, wickBottom: 90, bullish: true }] },
  { id: 'inverted-hammer', name: 'Inverted Hammer', bias: 'Bullish', role: 'Reversal (after a downtrend)', meaning: "A small body sits near the bottom with a long upper wick. Buyers tested higher ground — the next candle needs to confirm before you trust it.", candles: [{ bodyTop: 66, bodyBottom: 86, wickTop: 10, wickBottom: 92, bullish: true }] },
  { id: 'hanging-man', name: 'Hanging Man', bias: 'Bearish', role: 'Reversal (after an uptrend)', meaning: "The same shape as a Hammer — small body up top, long lower wick — but it shows up after an uptrend, warning that sellers are starting to probe the lows.", candles: [{ bodyTop: 14, bodyBottom: 34, wickTop: 8, wickBottom: 90, bullish: false }] },
  { id: 'shooting-star', name: 'Shooting Star', bias: 'Bearish', role: 'Reversal (after an uptrend)', meaning: "A small body near the bottom with a long upper wick after an uptrend. Buyers reached for new highs and got firmly rejected.", candles: [{ bodyTop: 66, bodyBottom: 86, wickTop: 10, wickBottom: 92, bullish: false }] },
  { id: 'spinning-top', name: 'Spinning Top', bias: 'Neutral', role: 'Indecision', meaning: "A small body with wicks of similar length on both sides — a tug-of-war between buyers and sellers that ended in a draw.", candles: [{ bodyTop: 42, bodyBottom: 58, wickTop: 15, wickBottom: 85, bullish: true }] },
  { id: 'marubozu-bull', name: 'Bullish Marubozu', bias: 'Bullish', role: 'Continuation / strong conviction', meaning: "A candle with almost no wicks at all — buyers were in full control from the open to the close. Strong conviction, often a continuation signal.", candles: [{ bodyTop: 8, bodyBottom: 92, wickTop: 8, wickBottom: 92, bullish: true }] },
  { id: 'marubozu-bear', name: 'Bearish Marubozu', bias: 'Bearish', role: 'Continuation / strong conviction', meaning: "The mirror image of a Bullish Marubozu — sellers ran the session start to finish with barely a wick to show for it.", candles: [{ bodyTop: 8, bodyBottom: 92, wickTop: 8, wickBottom: 92, bullish: false }] },
  { id: 'bull-engulf', name: 'Bullish Engulfing', bias: 'Bullish', role: 'Reversal (2-candle)', meaning: "A small down candle gets completely swallowed by a much bigger up candle. Buyers overwhelmed the prior selling — a classic bottoming signal.", candles: [{ bodyTop: 40, bodyBottom: 58, wickTop: 34, wickBottom: 64, bullish: false }, { bodyTop: 16, bodyBottom: 80, wickTop: 10, wickBottom: 86, bullish: true }] },
  { id: 'bear-engulf', name: 'Bearish Engulfing', bias: 'Bearish', role: 'Reversal (2-candle)', meaning: "A small up candle gets completely swallowed by a much bigger down candle — sellers just seized control of the session.", candles: [{ bodyTop: 40, bodyBottom: 58, wickTop: 34, wickBottom: 64, bullish: true }, { bodyTop: 16, bodyBottom: 80, wickTop: 10, wickBottom: 86, bullish: false }] },
  { id: 'piercing-line', name: 'Piercing Line', bias: 'Bullish', role: 'Reversal (2-candle)', meaning: "A down candle is followed by an up candle that opens below the prior low but closes back above the prior candle's midpoint — a strong bounce.", candles: [{ bodyTop: 20, bodyBottom: 55, wickTop: 14, wickBottom: 60, bullish: false }, { bodyTop: 22, bodyBottom: 72, wickTop: 16, wickBottom: 78, bullish: true }] },
  { id: 'dark-cloud', name: 'Dark Cloud Cover', bias: 'Bearish', role: 'Reversal (2-candle)', meaning: "An up candle is followed by a down candle that opens above the prior high but closes back below its midpoint — momentum stalling hard.", candles: [{ bodyTop: 45, bodyBottom: 80, wickTop: 40, wickBottom: 86, bullish: true }, { bodyTop: 28, bodyBottom: 78, wickTop: 22, wickBottom: 84, bullish: false }] },
  { id: 'morning-star', name: 'Morning Star', bias: 'Bullish', role: 'Reversal (3-candle)', meaning: "A strong sell-off, a small pause candle, then a strong rally that closes well back into the first candle's range — a textbook bottom.", candles: [{ bodyTop: 14, bodyBottom: 74, wickTop: 8, wickBottom: 80, bullish: false }, { bodyTop: 76, bodyBottom: 84, wickTop: 70, wickBottom: 90, bullish: true }, { bodyTop: 20, bodyBottom: 70, wickTop: 14, wickBottom: 76, bullish: true }] },
  { id: 'evening-star', name: 'Evening Star', bias: 'Bearish', role: 'Reversal (3-candle)', meaning: "A strong rally, a small pause candle, then a strong sell-off that closes well back into the first candle's range — the mirror of a Morning Star.", candles: [{ bodyTop: 20, bodyBottom: 80, wickTop: 14, wickBottom: 86, bullish: true }, { bodyTop: 12, bodyBottom: 20, wickTop: 6, wickBottom: 26, bullish: false }, { bodyTop: 24, bodyBottom: 84, wickTop: 18, wickBottom: 90, bullish: false }] },
  { id: 'three-soldiers', name: 'Three White Soldiers', bias: 'Bullish', role: 'Continuation / reversal (3-candle)', meaning: "Three strong up candles in a row, each closing near its high with small wicks. Steady, broad buying pressure.", candles: [{ bodyTop: 60, bodyBottom: 86, wickTop: 56, wickBottom: 90, bullish: true }, { bodyTop: 38, bodyBottom: 64, wickTop: 34, wickBottom: 68, bullish: true }, { bodyTop: 16, bodyBottom: 42, wickTop: 12, wickBottom: 46, bullish: true }] },
  { id: 'three-crows', name: 'Three Black Crows', bias: 'Bearish', role: 'Continuation / reversal (3-candle)', meaning: "Three strong down candles in a row, each closing near its low with small wicks — the mirror of Three White Soldiers.", candles: [{ bodyTop: 14, bodyBottom: 40, wickTop: 10, wickBottom: 44, bullish: false }, { bodyTop: 36, bodyBottom: 62, wickTop: 32, wickBottom: 66, bullish: false }, { bodyTop: 58, bodyBottom: 84, wickTop: 54, wickBottom: 88, bullish: false }] },
];

function CandleGlyph({ candles, height = 92 }: { candles: CandleSpec[]; height?: number }) {
  const w = 26; const gap = 12;
  const totalW = candles.length * w + (candles.length - 1) * gap;
  return (
    <svg viewBox={`0 0 ${totalW} 100`} width={totalW} height={height} style={{ display: 'block' }}>
      {candles.map((c, i) => {
        const cx = i * (w + gap) + w / 2;
        const color = c.bullish ? '#7AE2AA' : '#FB7185';
        const bodyH = Math.max(3, c.bodyBottom - c.bodyTop);
        return (
          <g key={i}>
            <line x1={cx} y1={c.wickTop} x2={cx} y2={c.wickBottom} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <rect x={cx - w / 2} y={c.bodyTop} width={w} height={bodyH} fill={color} rx={2.5} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Learning: trivia data ─────────────────────────────────────────────────────────
interface TriviaQuestion { id: string; question: string; options: string[]; correct: string }
const TRIVIA_QUESTIONS: TriviaQuestion[] = [
  { id: 'q1', question: 'What does the S&P 500 track?', options: ['500 large U.S. companies', '30 major U.S. companies', 'All Nasdaq tech stocks', 'Global bond yields'], correct: '500 large U.S. companies' },
  { id: 'q2', question: "A futures contract is best described as…", options: ['An agreement to buy or sell an asset at a set price on a future date', 'A share of ownership in a company', 'A loan between two brokers', 'A type of savings account'], correct: 'An agreement to buy or sell an asset at a set price on a future date' },
  { id: 'q3', question: 'Which type of stock typically comes with voting rights?', options: ['Common stock', 'Preferred stock', 'Treasury stock', 'Index stock'], correct: 'Common stock' },
  { id: 'q4', question: 'Roughly how many hours a week does the crypto market trade?', options: ['168 (24/7)', '40', '80', '120'], correct: '168 (24/7)' },
  { id: 'q5', question: "On a candlestick, what does the wick (shadow) represent?", options: ['The high and low price reached during the session', 'The trading volume', 'The average price over 10 days', 'The bid-ask spread'], correct: 'The high and low price reached during the session' },
  { id: 'q6', question: "A Hammer candlestick appearing after a downtrend typically signals…", options: ['A possible bullish reversal', 'A guaranteed breakout', 'A dividend payment', 'Increased leverage'], correct: 'A possible bullish reversal' },
  { id: 'q7', question: "A Bearish Engulfing pattern forms when…", options: ["A large down candle's body completely covers the prior up candle's body", 'Three green candles appear in a row', 'Volume drops to zero', 'Price gaps up on earnings'], correct: "A large down candle's body completely covers the prior up candle's body" },
  { id: 'q8', question: 'SMA stands for…', options: ['Simple Moving Average', 'Stock Market Analysis', 'Standard Margin Account', 'Sector Momentum Alert'], correct: 'Simple Moving Average' },
  { id: 'q9', question: 'A 20-period SMA is calculated by…', options: ["Averaging the last 20 closing prices", "Adding today's high and low", 'Multiplying volume by price', 'Averaging the last 20 trading years'], correct: 'Averaging the last 20 closing prices' },
  { id: 'q10', question: 'A "Golden Cross" refers to…', options: ['A shorter-term SMA crossing above a longer-term SMA', 'A stock hitting an all-time high', 'A company issuing new shares', 'A candlestick with no wicks'], correct: 'A shorter-term SMA crossing above a longer-term SMA' },
  { id: 'q11', question: 'RSI readings above 70 are typically considered…', options: ['Overbought', 'Oversold', 'Neutral', 'Illiquid'], correct: 'Overbought' },
  { id: 'q12', question: 'In risk management, a stop-loss is…', options: ['A predefined price where you exit to limit a loss', 'A bonus paid by your broker', 'A type of dividend', 'A signal to add more size'], correct: 'A predefined price where you exit to limit a loss' },
  { id: 'q13', question: 'The Buttonwood Agreement, which led to the founding of the NYSE, is dated to…', options: ['1792', '1602', '1929', '1971'], correct: '1792' },
  { id: 'q14', question: 'The Amsterdam Stock Exchange, created in 1602, is widely considered…', options: ["The world's first modern stock exchange", 'The first U.S. commodities market', 'The first crypto exchange', 'A 20th-century invention'], correct: "The world's first modern stock exchange" },
  { id: 'q15', question: 'Which U.S. regulator was created in 1934 in response to the 1929 crash?', options: ['The SEC', 'The FDIC', 'The NYSE', 'FINRA'], correct: 'The SEC' },
  { id: 'q16', question: 'In February 1970, who became the first African American member and floor broker of the NYSE?', options: ['Joseph L. Searles III', 'John W. Rogers Jr.', 'Chris Gardner', 'Jeremiah Hamilton'], correct: 'Joseph L. Searles III' },
  { id: 'q17', question: 'Daniels & Bell, founded in 1971, was notable as…', options: ['The first Black-owned investment firm with a seat on the NYSE', 'The first crypto exchange', 'The oldest bank in New York', 'The first index fund provider'], correct: 'The first Black-owned investment firm with a seat on the NYSE' },
  { id: 'q18', question: 'John W. Rogers Jr. founded which firm in 1983?', options: ['Ariel Investments', 'Daniels & Bell', 'Gardner Rich & Co.', 'Vanguard'], correct: 'Ariel Investments' },
  { id: 'q19', question: "A 'liquidity zone' generally refers to…", options: ['A cluster of resting stop-losses and pending orders', 'A stock with no trading volume', 'A type of dividend account', 'A candlestick pattern'], correct: 'A cluster of resting stop-losses and pending orders' },
  { id: 'q20', question: 'Why does WickBetts emphasize patience above almost everything else?', options: ['Because discipline, not speed, is what keeps an edge profitable over time', 'Because slower trades pay lower commissions', 'Because patience guarantees profit', 'Because markets are only open one hour a day'], correct: 'Because discipline, not speed, is what keeps an edge profitable over time' },
];

// ── Learning: presentational helpers ─────────────────────────────────────────────
function LessonHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="lesson-h3">{children}</h3>;
}
function Callout({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="lesson-callout"><span className="eyebrow">{label}</span><p>{children}</p></div>;
}
function DefinitionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="definition-card"><strong>{title}</strong><p>{children}</p></div>;
}

// ── Learning: module bodies ────────────────────────────────────────────────────────
function bodyWelcome(): React.ReactNode {
  return (
    <>
      <p>WickBetts is a trading community built to turn beginners into disciplined, patient traders — what the desk calls <strong>stock market snipers</strong>: people who wait for a clean setup instead of firing at everything that moves.</p>
      <LessonHeading>Why learn to trade at all?</LessonHeading>
      <p>Debt, bills, and the general expense of life have a way of piling up. Trading is a skill — not a shortcut — that can move you one step closer to financial freedom, if you treat it like one.</p>
      <Callout label="The one non-negotiable">
        <strong>Patience.</strong> This is not a get-rich-quick scheme — although you can get rich quickly, it is the patient mindset underneath that actually keeps you profitable over time. Every module after this one assumes you have internalized that.
      </Callout>
      <LessonHeading>What this academy covers</LessonHeading>
      <ul className="lesson-list">
        <li>The core fundamentals across all four markets WickBetts trades</li>
        <li>How to read a chart before you ever place a trade</li>
        <li>A personal risk framework you can actually stick to</li>
        <li>The discipline to grow from a demo account to real capital without blowing it up</li>
      </ul>
    </>
  );
}

function bodyMarkets101(): React.ReactNode {
  return (
    <>
      <p>Before you trade anything, know what you are trading. WickBetts covers four core markets — here is what each one actually is.</p>
      <div className="definition-grid">
        <DefinitionCard title="Indices">An index tracks the performance of a group of stocks to represent a market or sector. The <strong>S&amp;P 500</strong> tracks 500 large U.S. companies, the <strong>Dow Jones</strong> tracks 30 major U.S. companies, and the <strong>Nasdaq</strong> is weighted toward tech.</DefinitionCard>
        <DefinitionCard title="Futures">Financial contracts to buy or sell an asset at a predetermined price on a future date — commodity futures (oil, gold, wheat) and financial futures (the S&amp;P 500, interest rates, currencies). Used for hedging <em>and</em> speculation. Leverage amplifies gains <strong>and</strong> losses.</DefinitionCard>
        <DefinitionCard title="Stocks">Stocks represent ownership in a company. Common stock carries voting rights plus dividends; preferred stock gets dividend priority but limited voting. Profit comes from price appreciation and dividends — risk comes from company performance, the economy, and sentiment.</DefinitionCard>
        <DefinitionCard title="Crypto">Digital currencies secured by blockchain technology — Bitcoin, Ethereum, Solana. Highly volatile (10%+ daily swings are not rare), not tied to a company or government, and tradable 24/7 for investment, payments, or DeFi.</DefinitionCard>
      </div>
    </>
  );
}

function bodyDemoToLive(): React.ReactNode {
  return (
    <>
      <p>The best place to start is a platform like TradingView, where you can open a demo (paper trading) account and get real exposure to the market with zero real-money risk.</p>
      <LessonHeading>Set a realistic starting amount</LessonHeading>
      <p>Pick a demo balance you would actually be comfortable trading in real life. This is where you develop a strategy that fits your own style — trade against every asset class you just learned about and watch how price and P&amp;L actually move.</p>
      <Callout label="A readiness checkpoint, not a promise">
        One rough benchmark: try to grow the account by roughly $3k without ever giving back more than $2k along the way. It is not a guarantee of anything — it is a simple, illustrative way to prove to yourself that you can be net profitable <em>and</em> control your drawdowns before a single dollar of real capital is on the line.
      </Callout>
      <p>Only after that discipline shows up consistently in a demo does it make sense to size up into a live or prop-firm account.</p>
    </>
  );
}

function bodyReadingTheChart(): React.ReactNode {
  return (
    <>
      <p>Understanding the chart is the first thing to do before placing any trade — before an indicator, before a candlestick pattern, before anything else.</p>
      <div className="definition-grid">
        <DefinitionCard title="Trend">Is price bullish (climbing) or bearish (falling)? Everything else you do should agree with the answer, not fight it.</DefinitionCard>
        <DefinitionCard title="Volume">Is there a lot of it? If so, figure out when, where, and why — volume is the market telling you how much conviction is behind a move.</DefinitionCard>
        <DefinitionCard title="Timeframe">Start from the Daily (D) chart to find the higher-timeframe trend first, then drop into lower timeframes to time an entry.</DefinitionCard>
        <DefinitionCard title="Support &amp; Resistance">Support is a price floor where buying has stepped in before; resistance is a price ceiling where selling has capped price before. Price tends to react at both.</DefinitionCard>
      </div>
      <LessonHeading>Liquidity zones — a preview</LessonHeading>
      <p>A liquidity zone is an area packed with resting stop-losses and pending orders. Price is frequently drawn toward these zones before reversing — the <em>Liquidity &amp; Market Structure</em> module in the Advanced track goes much deeper on this.</p>
    </>
  );
}

function bodyCandlestickEncyclopedia(): React.ReactNode {
  return (
    <>
      <p>Every candle is a small story: the <strong>body</strong> is the range between the open and close, the <strong>color</strong> shows whether it closed up or down, and the <strong>wicks</strong> (or shadows) show the high and low the price actually reached — and got rejected from — during that session.</p>
      <div className="candle-grid">
        {CANDLE_PATTERNS.map((p) => (
          <div className="candle-card" key={p.id}>
            <div className="candle-card-stage"><CandleGlyph candles={p.candles} /></div>
            <div className="candle-card-body">
              <div className="candle-card-head">
                <strong>{p.name}</strong>
                <span className={`bias-pill bias-${p.bias.toLowerCase()}`}>{p.bias}</span>
              </div>
              <span className="candle-role">{p.role}</span>
              <p>{p.meaning}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function bodyIndicatorsToolkit(): React.ReactNode {
  return (
    <>
      <p>An indicator turns raw price into something easier to read. The one every trader learns first is the <strong>Simple Moving Average (SMA)</strong>.</p>
      <Callout label="The formula">
        SMA(n) = (P<sub>1</sub> + P<sub>2</sub> + … + P<sub>n</sub>) ÷ n — the average of the last <em>n</em> closing prices.
      </Callout>
      <LessonHeading>Worked example</LessonHeading>
      <p>Five daily closes: $48, $50, $49, $52, $53. A 5-period SMA is (48+50+49+52+53) ÷ 5 = <strong>$50.40</strong>. Tomorrow, the oldest price drops off and the newest one is added — the average "moves."</p>
      <LessonHeading>What SMA is actually used for</LessonHeading>
      <ul className="lesson-list">
        <li>Reading trend direction — price holding above a rising SMA leans bullish</li>
        <li>Acting as dynamic support or resistance</li>
        <li>Smoothing out noisy day-to-day price action</li>
        <li>Crossover signals — a shorter SMA crossing above a longer one (e.g. 50 over 200) is a <strong>Golden Cross</strong>; crossing below is a <strong>Death Cross</strong></li>
      </ul>
      <LessonHeading>The rest of the toolkit</LessonHeading>
      <div className="definition-grid">
        <DefinitionCard title="EMA">An Exponential Moving Average weights recent prices more heavily than an SMA, so it reacts faster to new moves.</DefinitionCard>
        <DefinitionCard title="RSI">Relative Strength Index — a 0–100 momentum gauge. Above 70 is generally considered overbought, below 30 oversold.</DefinitionCard>
        <DefinitionCard title="MACD">Moving Average Convergence Divergence — tracks the relationship between two EMAs to gauge trend and momentum together.</DefinitionCard>
        <DefinitionCard title="Volume">Confirms conviction. A move on rising volume carries more weight than the same move on a quiet tape.</DefinitionCard>
      </div>
      <p className="muted tiny">Indicators lag price — they describe what already happened. They work best stacked on top of the chart-reading and candlestick skills from earlier modules, not used alone.</p>
    </>
  );
}

function bodyRiskAndPsychology(): React.ReactNode {
  return (
    <>
      <p>An edge is only worth anything if you survive long enough to use it. That is what risk management is for.</p>
      <div className="definition-grid">
        <DefinitionCard title="Position sizing">A common starting range is risking a small, fixed slice of your account per trade — often cited around 0.5–2% — so no single loss can do lasting damage.</DefinitionCard>
        <DefinitionCard title="Define your stop first">Decide your invalidation level — the price that proves the idea wrong — before you enter, not after.</DefinitionCard>
        <DefinitionCard title="Risk / reward">Compare the distance to your target against the distance to your stop. A trade only makes sense if the reward justifies the risk.</DefinitionCard>
        <DefinitionCard title="Journal everything">Write down the setup, the reasoning, and the result. Patterns in your own behavior are the fastest thing you can learn from.</DefinitionCard>
      </div>
      <Callout label="Back to Module 1">
        Patience is not a slogan — it is the thing that keeps you from moving your stop, doubling down after a loss, or chasing a candle you already missed. Every rule above only works if patience is doing the enforcing.
      </Callout>
      <p>This is also exactly what <strong>trade reviews</strong> are for — bring real setups to the Community threads or a mentorship call and get a second pair of eyes before the pattern repeats.</p>
    </>
  );
}

function bodyLiquidityAndStructure(): React.ReactNode {
  return (
    <>
      <p>Price does not move randomly toward round numbers — it is frequently drawn toward liquidity: the resting stop-losses and pending orders clustered above old highs and below old lows.</p>
      <LessonHeading>Reading structure</LessonHeading>
      <ul className="lesson-list">
        <li><strong>Uptrend structure</strong> — a series of higher highs and higher lows</li>
        <li><strong>Downtrend structure</strong> — a series of lower highs and lower lows</li>
        <li><strong>Break of Structure (BOS)</strong> — price breaks the most recent swing high/low in the direction of the trend, confirming it is still intact</li>
        <li><strong>Change of Character (CHoCH)</strong> — price breaks structure against the prevailing trend, an early warning the trend may be turning</li>
      </ul>
      <LessonHeading>Why "obvious" levels get run first</LessonHeading>
      <p>The support and resistance everyone can see are exactly where the stop orders pile up. A quick move through that level to grab liquidity — a stop hunt — before reversing is one of the most common reasons a level almost holds and then does not.</p>
    </>
  );
}

function bodyTradingThroughHistory(): React.ReactNode {
  return (
    <>
      <p>Markets are older than most people assume — and the shape of today's trading desk was built one innovation at a time.</p>
      <div className="timeline">
        <div className="timeline-row"><span className="timeline-year">1602</span><p>The Dutch East India Company issues tradable shares on the <strong>Amsterdam Stock Exchange</strong> — widely considered the world's first modern stock exchange.</p></div>
        <div className="timeline-row"><span className="timeline-year">1792</span><p>Twenty-four brokers sign the <strong>Buttonwood Agreement</strong> under a buttonwood tree on Wall Street, laying the groundwork for the New York Stock Exchange.</p></div>
        <div className="timeline-row"><span className="timeline-year">1800s</span><p>The telegraph and ticker tape speed up how fast price information travels — the first real edge was often just getting the news first.</p></div>
        <div className="timeline-row"><span className="timeline-year">1934</span><p>The <strong>SEC</strong> is created in the aftermath of the 1929 crash to regulate markets and protect investors.</p></div>
        <div className="timeline-row"><span className="timeline-year">1971</span><p><strong>Nasdaq</strong> launches as the world's first electronic stock market.</p></div>
        <div className="timeline-row"><span className="timeline-year">1973</span><p>The Chicago Board Options Exchange (CBOE) opens, formalizing modern options trading.</p></div>
        <div className="timeline-row"><span className="timeline-year">2009</span><p>Bitcoin's genesis block is mined, kicking off the crypto markets from scratch.</p></div>
        <div className="timeline-row"><span className="timeline-year">Today</span><p>Retail traders carry every market on this timeline in their pocket. The access changed completely — the need for discipline never did.</p></div>
      </div>
    </>
  );
}

function bodyTrailblazers(): React.ReactNode {
  return (
    <>
      <p>Wall Street was not built to let everyone in. These traders and investors forced the door open anyway — and changed who gets to sit at the desk.</p>
      <div className="bio-grid">
        <div className="bio-card"><strong>Jeremiah G. Hamilton</strong><span className="bio-meta">Broker · d. 1875</span><p>Operating almost entirely outside the era's brokerage establishment, Hamilton built a fortune trading stocks, bonds, and shipping insurance in mid-19th-century New York — reportedly leaving an estate worth around $2 million at his death, making him widely regarded as America's first Black millionaire.</p></div>
        <div className="bio-card"><strong>Joseph L. Searles III</strong><span className="bio-meta">NYSE floor broker · 1970</span><p>In February 1970, Searles became the first African American member and floor broker of the New York Stock Exchange, breaking a barrier that had stood since the exchange's 1792 founding.</p></div>
        <div className="bio-card"><strong>Travers J. Bell Jr. &amp; Willie L. Daniels</strong><span className="bio-meta">Daniels &amp; Bell · 1971</span><p>Co-founded Daniels &amp; Bell, the first Black-owned investment firm to hold a seat on the New York Stock Exchange.</p></div>
        <div className="bio-card"><strong>John W. Rogers Jr.</strong><span className="bio-meta">Ariel Investments · 1983</span><p>At 24, Rogers started Ariel Investments with $200,000 raised from family and friends — the first Black-owned mutual fund company in the U.S. It has since grown into the largest minority-run asset manager in the country.</p></div>
        <div className="bio-card"><strong>Mellody Hobson</strong><span className="bio-meta">Co-CEO, Ariel Investments</span><p>One of the most prominent Black women in American finance, Hobson has spent her career pushing financial literacy into the mainstream while helping lead Ariel Investments and chairing Starbucks' board.</p></div>
        <div className="bio-card"><strong>Chris Gardner</strong><span className="bio-meta">Founder, Gardner Rich &amp; Co.</span><p>After a period of homelessness, Gardner built a career as a stockbroker and went on to found his own brokerage firm — a story that later became widely known through <em>The Pursuit of Happyness</em>.</p></div>
      </div>
      <p className="muted tiny">This is a starting point, not a complete history — there are many more stories worth reading beyond this module.</p>
    </>
  );
}

// ── Learning: module registry ──────────────────────────────────────────────────────
const LEARNING_MODULES: LearningModule[] = [
  { id: 'welcome', level: 'Beginner', kind: 'lesson', title: 'Welcome to WickBetts', tagline: 'What this academy is, and the one trait that matters more than any indicator.', minutes: 4, xp: 40, icon: GraduationCap, body: bodyWelcome },
  { id: 'markets-101', level: 'Beginner', kind: 'lesson', title: 'The Four Markets', tagline: 'Indices, futures, stocks, and crypto — what each one actually is.', minutes: 7, xp: 50, icon: Layers, body: bodyMarkets101 },
  { id: 'demo-to-live', level: 'Beginner', kind: 'lesson', title: 'From Demo to Live', tagline: "Where to practice, how much to risk first, and the checkpoint that tells you you're ready.", minutes: 5, xp: 40, icon: Rocket, body: bodyDemoToLive },
  { id: 'reading-the-chart', level: 'Intermediate', kind: 'lesson', title: 'Reading the Chart', tagline: 'Trend, volume, timeframes, support & resistance — before every trade.', minutes: 8, xp: 60, icon: TrendingUp, body: bodyReadingTheChart },
  { id: 'candlestick-encyclopedia', level: 'Intermediate', kind: 'lesson', title: 'The Candlestick Encyclopedia', tagline: 'Every candle tells a story — learn to read all of them.', minutes: 12, xp: 80, icon: CandlestickChart, body: bodyCandlestickEncyclopedia },
  { id: 'candle-arcade', level: 'Intermediate', kind: 'game', title: 'Candle ID Arcade', tagline: 'Speed-round: name the pattern before the streak breaks.', minutes: 5, xp: 0, icon: Gamepad2 },
  { id: 'indicators-toolkit', level: 'Advanced', kind: 'lesson', title: 'Indicators 101: SMA & Friends', tagline: 'The Simple Moving Average — the math, the meaning, and the crossover signals.', minutes: 9, xp: 70, icon: Percent, body: bodyIndicatorsToolkit },
  { id: 'risk-and-psychology', level: 'Advanced', kind: 'lesson', title: "Risk & the Trader's Mindset", tagline: 'Position sizing, stops, and the patience that keeps an edge alive.', minutes: 8, xp: 60, icon: ShieldCheck, body: bodyRiskAndPsychology },
  { id: 'liquidity-and-structure', level: 'Advanced', kind: 'lesson', title: 'Liquidity & Market Structure', tagline: 'Why price hunts obvious stops, and how to read structure like the desk does.', minutes: 7, xp: 60, icon: Target, body: bodyLiquidityAndStructure },
  { id: 'trading-through-history', level: 'Expert', kind: 'lesson', title: 'A Short History of Trading', tagline: 'From Amsterdam warehouses to algorithms — how markets got here.', minutes: 8, xp: 70, icon: BookMarked, body: bodyTradingThroughHistory },
  { id: 'trailblazers', level: 'Expert', kind: 'lesson', title: 'Trailblazers: Great Black Traders & Investors', tagline: "The people who broke into rooms that weren't built for them.", minutes: 10, xp: 80, icon: Crown, body: bodyTrailblazers },
  { id: 'trivia-arena', level: 'Expert', kind: 'game', title: 'Trivia Arena', tagline: 'Mixed rapid-fire questions across every module.', minutes: 6, xp: 0, icon: Swords },
];

// ── Learning: page ──────────────────────────────────────────────────────────────────
function LearningPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [progress, setProgress] = useState<LearningProgress>(() => loadLearningProgress(userId));
  const [activeLevel, setActiveLevel] = useState<LearningLevel>('Beginner');
  const [view, setView] = useState<'overview' | 'module'>('overview');
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  useEffect(() => { setProgress(loadLearningProgress(userId)); }, [userId]);
  useEffect(() => { saveLearningProgress(userId, progress); }, [userId, progress]);

  // Daily streak — bump once per calendar day, reset if a day was skipped.
  useEffect(() => {
    const today = new Date().toDateString();
    setProgress((prev) => {
      if (prev.lastVisit === today) return prev;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const nextStreak = prev.lastVisit === yesterday ? prev.streakDays + 1 : 1;
      return { ...prev, lastVisit: today, streakDays: nextStreak };
    });
  }, []);

  const { level, intoLevel, forNext } = levelFromXp(progress.xp);
  const activeModule = LEARNING_MODULES.find((m) => m.id === activeModuleId) ?? null;
  const modulesInLevel = LEARNING_MODULES.filter((m) => m.level === activeLevel);
  const totalModules = LEARNING_MODULES.length;
  const completedCount = progress.completedModules.length;

  const completeModule = (id: string) => {
    setProgress((prev) => {
      if (prev.completedModules.includes(id)) return prev;
      const mod = LEARNING_MODULES.find((m) => m.id === id);
      return { ...prev, completedModules: [...prev.completedModules, id], xp: prev.xp + (mod?.xp ?? 0) };
    });
  };

  const openModule = (id: string) => { setActiveModuleId(id); setView('module'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const backToOverview = () => { setView('overview'); setActiveModuleId(null); };

  const levelCompletion = (lvl: LearningLevel) => {
    const inLevel = LEARNING_MODULES.filter((m) => m.level === lvl);
    const done = inLevel.filter((m) => progress.completedModules.includes(m.id)).length;
    return { done, total: inLevel.length };
  };

  return (
    <div className="page">
      <PageHeading
        eyebrow="The academy"
        title="Learning."
        description="Beginner to expert, gamified. Read the fundamentals, master candlesticks, and prove it in the arcade."
      />

      <div className="learning-stats surface animate-in">
        <div className="learning-stat">
          <span className="eyebrow">Level</span>
          <div className="learning-level-badge"><Star size={13} /> {level}</div>
        </div>
        <div className="learning-stat learning-stat--wide">
          <span className="eyebrow">XP to next level</span>
          <div className="xp-bar"><div className="xp-bar-fill" style={{ width: `${Math.round((intoLevel / forNext) * 100)}%` }} /></div>
          <span className="tiny muted">{intoLevel} / {forNext} XP</span>
        </div>
        <div className="learning-stat">
          <span className="eyebrow">Streak</span>
          <div className="learning-level-badge"><Flame size={13} /> {progress.streakDays}d</div>
        </div>
        <div className="learning-stat">
          <span className="eyebrow">Modules</span>
          <div className="learning-level-badge"><Trophy size={13} /> {completedCount}/{totalModules}</div>
        </div>
      </div>

      {view === 'overview' ? (
        <>
          <div className="filter-bar" style={{ marginTop: 28 }}>
            {LEARNING_LEVELS.map((lvl) => {
              const { done, total } = levelCompletion(lvl);
              return (
                <button
                  key={lvl}
                  className={`filter-chip ${activeLevel === lvl ? 'selected' : ''}`}
                  onClick={() => setActiveLevel(lvl)}
                  data-testid={`filter-learning-level-${lvl.toLowerCase()}`}
                >
                  {lvl} <span className="tiny" style={{ opacity: 0.7 }}>· {done}/{total}</span>
                </button>
              );
            })}
          </div>

          <div className="module-grid animate-in delay-1">
            {modulesInLevel.map((mod) => {
              const Icon = mod.icon;
              const done = progress.completedModules.includes(mod.id);
              return (
                <button key={mod.id} className="module-card" onClick={() => openModule(mod.id)} data-testid={`card-module-${mod.id}`}>
                  <div className={`module-icon ${mod.kind === 'game' ? 'module-icon--game' : ''}`}><Icon size={18} /></div>
                  <span className="eyebrow">{mod.kind === 'game' ? 'Arcade game' : `${mod.level} module`}</span>
                  <h3>{mod.title}</h3>
                  <p>{mod.tagline}</p>
                  <div className="module-meta">
                    {mod.kind === 'game'
                      ? <span>Best score: {mod.id === 'candle-arcade' ? progress.candleGame.bestScore : progress.triviaGame.bestScore}</span>
                      : <span><Clock3 size={11} /> {mod.minutes} min · +{mod.xp} XP</span>}
                    {done && <span className="status-pill status-active"><Check size={10} /> Done</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <section className="surface-dark learning-perks animate-in delay-2">
            <span className="eyebrow light">Included with every membership</span>
            <h3>You already have all of this.</h3>
            <div className="perks-row">
              <div className="perk"><MessageCircle size={16} /><div><strong>Community access</strong><p>Trade ideas and discussion across the Signals, News, and Community Chat threads.</p></div></div>
              <div className="perk"><GraduationCap size={16} /><div><strong>The full Learning tab</strong><p>Every module and both arcade games on this page, from beginner to expert.</p></div></div>
              <div className="perk"><ShieldCheck size={16} /><div><strong>Trade reviews</strong><p>Bring real setups to Community or a mentorship call and get them looked at by the desk.</p></div></div>
            </div>
          </section>
        </>
      ) : activeModule?.kind === 'game' ? (
        <div className="animate-in">
          <button className="button button-outline" style={{ marginBottom: 20 }} onClick={backToOverview} data-testid="button-back-to-path"><ChevronLeft size={13} /> Back to path</button>
          {activeModule.id === 'candle-arcade'
            ? <CandleArcadeGame progress={progress} setProgress={setProgress} />
            : <TriviaArenaGame progress={progress} setProgress={setProgress} />}
        </div>
      ) : activeModule ? (
        <LessonView
          module={activeModule}
          completed={progress.completedModules.includes(activeModule.id)}
          onComplete={() => completeModule(activeModule.id)}
          onBack={backToOverview}
          onNext={() => {
            const siblings = LEARNING_MODULES.filter((m) => m.level === activeModule.level);
            const idx = siblings.findIndex((m) => m.id === activeModule.id);
            const next = siblings[idx + 1];
            if (next) openModule(next.id); else backToOverview();
          }}
        />
      ) : null}

      <p className="table-note" style={{ marginTop: 24 }}>Educational content only — not investment advice. Progress and scores are saved on this device.</p>
    </div>
  );
}

function LessonView({ module, completed, onComplete, onBack, onNext }: { module: LearningModule; completed: boolean; onComplete: () => void; onBack: () => void; onNext: () => void }) {
  const Icon = module.icon;
  return (
    <div className="surface lesson-view animate-in">
      <button className="button button-outline" style={{ marginBottom: 20 }} onClick={onBack} data-testid="button-back-to-path"><ChevronLeft size={13} /> Back to path</button>
      <div className="lesson-head">
        <div className="module-icon"><Icon size={20} /></div>
        <div>
          <span className="eyebrow">{module.level} module</span>
          <h2>{module.title}</h2>
          <span className="muted tiny"><Clock3 size={11} /> {module.minutes} min read · +{module.xp} XP</span>
        </div>
      </div>
      <div className="lesson-body">{module.body?.()}</div>
      <div className="lesson-actions">
        {completed
          ? <span className="status-pill status-active"><Check size={11} /> Completed</span>
          : <button className="button button-primary" onClick={onComplete} data-testid="button-complete-lesson">Mark complete <Check size={13} /></button>}
        <button className="button button-outline" onClick={onNext} data-testid="button-next-lesson">Next lesson <ArrowRight size={13} /></button>
      </div>
    </div>
  );
}

// ── Learning: Candle ID Arcade game ──────────────────────────────────────────────
const CANDLE_GAME_ROUNDS = 8;

function CandleArcadeGame({ progress, setProgress }: { progress: LearningProgress; setProgress: React.Dispatch<React.SetStateAction<LearningProgress>> }) {
  const [order, setOrder] = useState<CandlePattern[]>(() => sampleArr(CANDLE_PATTERNS, CANDLE_GAME_ROUNDS));
  const [round, setRound] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreakThisRun, setBestStreakThisRun] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = order[round];

  useEffect(() => {
    if (!current) return;
    const distractors = sampleArr(CANDLE_PATTERNS.filter((p) => p.id !== current.id), 3).map((p) => p.name);
    setOptions(shuffleArr([current.name, ...distractors]));
    setSelected(null);
  }, [round]);

  const pick = (name: string) => {
    if (selected || !current) return;
    setSelected(name);
    const correct = name === current.name;
    if (correct) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreakThisRun((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  };

  const finishRound = (finalScore: number, finalBestStreak: number) => {
    const xpEarned = finalScore * 10 + finalBestStreak * 5;
    setProgress((prev) => ({
      ...prev,
      xp: prev.xp + xpEarned,
      candleGame: {
        bestScore: Math.max(prev.candleGame.bestScore, finalScore),
        bestStreak: Math.max(prev.candleGame.bestStreak, finalBestStreak),
        plays: prev.candleGame.plays + 1,
      },
    }));
  };

  const next = () => {
    if (round + 1 >= order.length) {
      finishRound(score, bestStreakThisRun);
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
  };

  const playAgain = () => {
    setOrder(sampleArr(CANDLE_PATTERNS, CANDLE_GAME_ROUNDS));
    setRound(0); setScore(0); setStreak(0); setBestStreakThisRun(0); setFinished(false); setSelected(null);
  };

  if (finished) {
    const xpEarned = score * 10 + bestStreakThisRun * 5;
    return (
      <div className="surface game-recap animate-in">
        <Trophy size={26} />
        <h3>Round complete.</h3>
        <p>You scored <strong>{score}/{order.length}</strong> with a best streak of <strong>{bestStreakThisRun}</strong>.</p>
        <div className="status-pill status-active" style={{ marginTop: 6 }}><Zap size={11} /> +{xpEarned} XP earned</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="button button-primary" onClick={playAgain} data-testid="button-play-again-candle"><RotateCcw size={13} /> Play again</button>
        </div>
        <p className="muted tiny" style={{ marginTop: 16 }}>Personal best: {Math.max(progress.candleGame.bestScore, score)}/{order.length} · Best streak {Math.max(progress.candleGame.bestStreak, bestStreakThisRun)}</p>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="surface game-panel animate-in">
      <div className="game-topbar">
        <span className="eyebrow">Round {round + 1}/{order.length}</span>
        <span className="game-stat"><Trophy size={12} /> {score}</span>
        <span className="game-stat"><Flame size={12} /> {streak}</span>
      </div>
      <div className="game-candle-stage"><CandleGlyph candles={current.candles} height={130} /></div>
      <p className="muted tiny" style={{ textAlign: 'center', marginBottom: 18 }}>What pattern is this?</p>
      <div className="game-options">
        {options.map((opt) => {
          const isCorrect = opt === current.name;
          const isSelected = opt === selected;
          const cls = selected ? (isCorrect ? 'game-option correct' : isSelected ? 'game-option wrong' : 'game-option') : 'game-option';
          return (
            <button key={opt} className={cls} onClick={() => pick(opt)} disabled={!!selected} data-testid={`option-candle-${opt.toLowerCase().replace(/\s+/g, '-')}`}>
              {opt}
            </button>
          );
        })}
      </div>
      {selected && (
        <div style={{ marginTop: 18 }}>
          <p className="muted tiny">{current.meaning}</p>
          <button className="button button-dark" style={{ marginTop: 12 }} onClick={next} data-testid="button-next-round">
            {round + 1 >= order.length ? 'See results' : 'Next round'} <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Learning: Trivia Arena game ──────────────────────────────────────────────────
const TRIVIA_ROUNDS = 8;

function TriviaArenaGame({ progress, setProgress }: { progress: LearningProgress; setProgress: React.Dispatch<React.SetStateAction<LearningProgress>> }) {
  const [order, setOrder] = useState<TriviaQuestion[]>(() => sampleArr(TRIVIA_QUESTIONS, TRIVIA_ROUNDS));
  const [round, setRound] = useState(0);
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = order[round];

  useEffect(() => {
    if (!current) return;
    setOptions(shuffleArr(current.options));
    setSelected(null);
  }, [round]);

  const pick = (opt: string) => {
    if (selected || !current) return;
    setSelected(opt);
    if (opt === current.correct) setScore((s) => s + 1);
  };

  const finishRound = (finalScore: number) => {
    const xpEarned = finalScore * 12;
    setProgress((prev) => ({
      ...prev,
      xp: prev.xp + xpEarned,
      triviaGame: { bestScore: Math.max(prev.triviaGame.bestScore, finalScore), plays: prev.triviaGame.plays + 1 },
    }));
  };

  const next = () => {
    if (round + 1 >= order.length) {
      finishRound(score);
      setFinished(true);
      return;
    }
    setRound((r) => r + 1);
  };

  const playAgain = () => {
    setOrder(sampleArr(TRIVIA_QUESTIONS, TRIVIA_ROUNDS));
    setRound(0); setScore(0); setFinished(false); setSelected(null);
  };

  if (finished) {
    const xpEarned = score * 12;
    return (
      <div className="surface game-recap animate-in">
        <Swords size={26} />
        <h3>Arena cleared.</h3>
        <p>You scored <strong>{score}/{order.length}</strong>.</p>
        <div className="status-pill status-active" style={{ marginTop: 6 }}><Zap size={11} /> +{xpEarned} XP earned</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="button button-primary" onClick={playAgain} data-testid="button-play-again-trivia"><RotateCcw size={13} /> Play again</button>
        </div>
        <p className="muted tiny" style={{ marginTop: 16 }}>Personal best: {Math.max(progress.triviaGame.bestScore, score)}/{order.length}</p>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="surface game-panel animate-in">
      <div className="game-topbar">
        <span className="eyebrow">Question {round + 1}/{order.length}</span>
        <span className="game-stat"><Trophy size={12} /> {score}</span>
      </div>
      <h3 className="trivia-question">{current.question}</h3>
      <div className="game-options game-options--stack">
        {options.map((opt) => {
          const isCorrect = opt === current.correct;
          const isSelected = opt === selected;
          const cls = selected ? (isCorrect ? 'game-option correct' : isSelected ? 'game-option wrong' : 'game-option') : 'game-option';
          return (
            <button key={opt} className={cls} onClick={() => pick(opt)} disabled={!!selected} data-testid={`option-trivia-${opt.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
              {opt}
            </button>
          );
        })}
      </div>
      {selected && (
        <button className="button button-dark" style={{ marginTop: 18 }} onClick={next} data-testid="button-next-trivia">
          {round + 1 >= order.length ? 'See results' : 'Next question'} <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

// ── Mentorship ─────────────────────────────────────────────────────────────────
function MentorshipPage() {
  const { subscription } = useAuth();
  const [selectedDay, setSelectedDay] = useState(20);
  const [booked, setBooked] = useState<string[]>([]);
  const isPremium = subscription?.plan === 'mentorship';
  const book = (id: string) => setBooked([...booked, id]);
  return <div className="page"><PageHeading eyebrow="The closer room" title="Mentorship." description="One hour, once a week, with enough space to examine your process rather than chase the next idea." />
    {!isPremium ? <div className="locked-panel animate-in"><LockKeyhole size={18} /><h3>A quieter room, reserved for mentorship.</h3><p>Mentorship includes the complete Wick desk plus four one-hour calls per billing cycle. Upgrade your membership to unlock this room.</p><Link href="/app/profile" className="button button-dark" data-testid="link-upgrade-mentorship">View membership <ArrowRight size={14} /></Link></div> : <div className="calendar-layout animate-in"><section className="surface calendar-card"><div className="calendar-head"><div><span className="eyebrow">August 2026</span><h3>Find your hour.</h3></div><div className="month-switch"><button className="icon-button" data-testid="button-calendar-prev"><ChevronLeft size={15} /></button><button className="icon-button" data-testid="button-calendar-next"><ChevronRight size={15} /></button></div></div><div className="weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => <span className="weekday" key={d}>{d}</span>)}</div><div className="calendar-days">{Array.from({length:31},(_,i)=>i+1).map((day) => <button key={day} className={`day ${day === 11 ? 'today' : ''} ${day === selectedDay ? 'selected' : ''}`} onClick={() => setSelectedDay(day)} data-testid={`button-calendar-day-${day}`}>{day}{[14,19,20,26].includes(day) && <span className="day-dot" />}</button>)}</div></section><section className="surface slot-panel"><span className="eyebrow">Available appointments</span><h3>Aug {selectedDay}</h3><p>All times in Eastern Time. Calls are one hour.</p>{slots.map((slot) => booked.includes(slot.id) ? <div className="slot" key={slot.id}><div className="slot-time"><strong>{slot.time}</strong><span>{slot.date} · {slot.duration}</span></div><span className="status-pill status-active"><Check size={11} /> Booked</span></div> : <div className="slot" key={slot.id}><div className="slot-time"><strong>{slot.time}</strong><span>{slot.date} · {slot.duration}</span></div>{slot.available ? <button className="button button-dark" onClick={() => book(slot.id)} data-testid={`button-book-slot-${slot.id}`}>Book hour</button> : <span className="muted tiny">Taken</span>}</div>)}</section></div>}
  </div>;
}

// ── Profile ────────────────────────────────────────────────────────────────────
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={onToggle} aria-label={label} data-testid={`toggle-${label.toLowerCase().replaceAll(' ','-')}`}><span /></button>;
}

function ProfilePage() {
  const { user, subscription, logout, openBillingPortal, startCheckout, getToken, uploadProfileImage } = useAuth();
  const [notifySignals, setNotifySignals] = useState(user?.notifySignals ?? true);
  const [notifyNews, setNotifyNews] = useState(user?.notifyNews ?? false);
  const [notifyError, setNotifyError] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Reset the broken-image flag whenever the avatar URL itself changes
  // (e.g. right after a successful upload) so a fresh URL gets a fresh try.
  useEffect(() => { setAvatarBroken(false); }, [user?.avatarUrl]);

  const handleAvatarFile = async (file: File) => {
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read the selected file.'));
        reader.readAsDataURL(file);
      });
      await uploadProfileImage(dataUri);
    } catch (err) {
      setAvatarError((err as Error).message || 'Could not update your profile picture. Try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const memberName = usernameFromUser(user);
  const plan = subscription?.plan ?? 'signals';
  const subStatus = subscription?.status;
  const billingEnd = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
    : 'N/A';

  const handleBillingPortal = async () => {
    setPortalError('');
    setPortalLoading(true);
    try { await openBillingPortal(); }
    catch (err) { setPortalError((err as Error).message); }
    finally { setPortalLoading(false); }
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try { await startCheckout('mentorship'); }
    catch (err) { setPortalError((err as Error).message); }
    finally { setCheckoutLoading(false); }
  };

  // Initialise toggle state from the user object once it loads / changes.
  useEffect(() => {
    if (user) {
      setNotifySignals(user.notifySignals ?? true);
      setNotifyNews(user.notifyNews ?? false);
    }
  }, [user]);

  // Persist a preference change optimistically; revert on failure.
  const savePref = async (key: 'notifySignals' | 'notifyNews', value: boolean) => {
    const set = key === 'notifySignals' ? setNotifySignals : setNotifyNews;
    const prev = key === 'notifySignals' ? notifySignals : notifyNews;
    setNotifyError('');
    set(value);
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/auth/notifications'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ [key]: value }),
      });
      if (!r.ok) throw new Error('Failed');
    } catch {
      set(prev);
      setNotifyError('Could not save your preference. Please try again.');
    }
  };

  const isAdmin = user?.role === 'admin';

  return <div className="page"><PageHeading eyebrow="Your account" title="Profile." description="The practical details behind your membership." />
    <div className="profile-grid">
      <section className="surface profile-card animate-in">
        <span className="eyebrow">Account</span>
        <div className="profile-identity" style={{marginTop:18}}>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="avatar-edit-button"
            style={{ position: 'relative', border: 0, background: 'none', padding: 0, cursor: avatarUploading ? 'default' : 'pointer' }}
            title="Change profile picture"
            data-testid="button-change-avatar"
          >
            {user?.avatarUrl && !avatarBroken
              ? (
                <img
                  src={user.avatarUrl}
                  alt={memberName}
                  className="avatar-img avatar-img--lg"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)}
                />
              )
              : <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(memberName)}</span>
            }
            <span
              style={{
                position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%',
                background: 'var(--primary)', color: 'var(--primary-foreground)', display: 'grid', placeItems: 'center',
                border: '2px solid var(--card)',
              }}
            >
              {avatarUploading ? <LoaderCircle size={9} className="spin" /> : <Camera size={9} />}
            </span>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarFile(f); e.target.value = ''; }}
            data-testid="input-avatar-file"
          />
          <div><strong>{memberName}</strong><span>{plan === 'mentorship' ? 'Mentorship member' : 'Signals member'}{isAdmin ? ' · Admin' : ''}</span></div>
        </div>
        {avatarError && <p className="checkout-error" style={{marginTop:8}}>{avatarError}</p>}
        <div className="detail-list">
          <div className="detail"><label>Email</label><span>{user?.email}</span></div>
          <div className="detail"><label>Signed in with</label><span>Google</span></div>
          <div className="detail"><label>Plan</label><span style={{textTransform:'capitalize'}}>{plan} · ${plan === 'mentorship' ? '500' : '250'}/mo</span></div>
          <div className="detail"><label>Status</label><span className={subStatus === 'active' ? 'positive' : 'muted'} style={{textTransform:'capitalize'}}>{subStatus ?? 'No active subscription'}</span></div>
          {subStatus === 'active' && <div className="detail"><label>Next billing</label><span>{billingEnd}</span></div>}
        </div>
        <div style={{display:'flex',gap:10,marginTop:22,flexWrap:'wrap'}}>
          <button className="button button-outline" onClick={() => void handleBillingPortal()} disabled={portalLoading} data-testid="button-billing-portal">
            <CreditCard size={13} /> {portalLoading ? 'Loading…' : 'Manage billing'}
          </button>
          <button className="button button-outline" onClick={() => void logout()} data-testid="button-signout">
            <LogOut size={13} /> Sign out
          </button>
        </div>
        {portalError && <p className="checkout-error" style={{marginTop:10}}>{portalError}</p>}
        {isAdmin && (
          <div style={{marginTop:20,paddingTop:20,borderTop:'1px solid var(--border)'}}>
            <span className="eyebrow" style={{marginBottom:12,display:'block'}}>Admin</span>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              <Link href="/app/admin/signals" className="button button-outline" data-testid="link-admin-signals">
                <Radio size={13}/> Signal studio
              </Link>
              <Link href="/app/admin/users" className="button button-outline" data-testid="link-admin-users">
                <UserRound size={13}/> Manage users
              </Link>
            </div>
          </div>
        )}
      </section>
      <section className="surface profile-card animate-in delay-1">
        <span className="eyebrow">Membership</span>
        <h3>Choose your room.</h3>
        <div className="plan-switch">
          <div className={plan === 'signals' ? 'selected' : ''}>Signals · $250/mo{plan === 'signals' && <Check size={11} style={{marginLeft:5}} />}</div>
          {plan !== 'mentorship' && <button className="button button-dark" onClick={() => void handleUpgrade()} disabled={checkoutLoading} data-testid="button-upgrade-mentorship">
            {checkoutLoading ? 'Loading…' : 'Upgrade to Mentorship · $500'}
          </button>}
          {plan === 'mentorship' && <div className="selected">Mentorship · $500/mo<Check size={11} style={{marginLeft:5}} /></div>}
        </div>
        <div style={{marginTop:32}}>
          <span className="eyebrow">Notifications</span>
          <div className="setting-row"><div><strong>New signals</strong><p>When Wick posts a new setup or status change.</p></div><Toggle on={notifySignals} onToggle={() => void savePref('notifySignals', !notifySignals)} label="new signals" /></div>
          <div className="setting-row"><div><strong>Major news</strong><p>Only market-moving updates from the newsroom.</p></div><Toggle on={notifyNews} onToggle={() => void savePref('notifyNews', !notifyNews)} label="major news" /></div>
          {notifyError && <p className="checkout-error" style={{marginTop:12}}>{notifyError}</p>}
        </div>
      </section>
    </div>
  </div>;
}

// ── Admin: Signal Studio ───────────────────────────────────────────────────────
type SignalForm = {
  asset: string; market: 'Stocks' | 'Crypto'; direction: 'Long' | 'Short';
  status: SignalStatus; timeframe: string; entry: string; target: string;
  stop: string; risk: string; analysis: string; isOption: boolean;
  optionType: 'Call' | 'Put'; contract: string; expiration: string; strike: string;
  premium: string; bid: string; ask: string; impliedVolatility: string;
  delta: string; gamma: string; theta: string; vega: string; openInterest: string;
};

const blankSignalForm: SignalForm = {
  asset: '', market: 'Stocks', direction: 'Long', status: 'Active',
  timeframe: '', entry: '', target: '', stop: '', risk: 'Medium', analysis: '',
  isOption: false, optionType: 'Call', contract: '', expiration: '', strike: '',
  premium: '', bid: '', ask: '', impliedVolatility: '', delta: '', gamma: '',
  theta: '', vega: '', openInterest: '',
};

function AdminSignalForm({
  form, editingId, submitting, error, success,
  upd, onSubmit, onCancel,
}: {
  form: SignalForm; editingId: string | null; submitting: boolean; error: string; success: string;
  upd: <K extends keyof SignalForm>(k: K, v: SignalForm[K]) => void;
  onSubmit: () => void; onCancel: () => void;
}) {
  const SF = ({ label, name, placeholder, multiline }: { label: string; name: keyof SignalForm; placeholder?: string; multiline?: boolean }) => (
    <div className="sf-field">
      <label className="sf-label">{label}</label>
      {multiline
        ? <textarea className="sf-input sf-textarea" value={form[name] as string} onChange={(e) => upd(name, e.target.value as never)} placeholder={placeholder} data-testid={`input-signal-${name}`} />
        : <input className="sf-input" value={form[name] as string} onChange={(e) => upd(name, e.target.value as never)} placeholder={placeholder} data-testid={`input-signal-${name}`} />}
    </div>
  );
  const Sel = ({ label, name, options }: { label: string; name: keyof SignalForm; options: string[] }) => (
    <div className="sf-field">
      <label className="sf-label">{label}</label>
      <select className="sf-input sf-select" value={form[name] as string} onChange={(e) => upd(name, e.target.value as never)} data-testid={`select-signal-${name}`}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
  const Seg = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button type="button" className={`sf-seg ${active ? 'sf-seg-on' : ''}`} onClick={onClick}>{label}</button>
  );

  return (
    <div className="surface animate-in" style={{padding:'28px 32px',marginBottom:24}}>
      {/* Greeks disclaimer */}
      <div style={{background:'#2B1D14',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',gap:12,marginBottom:24,alignItems:'flex-start'}}>
        <ShieldCheck size={17} color="#FDBA74" style={{flexShrink:0,marginTop:2}}/>
        <div>
          <strong style={{color:'#FDBA74',fontSize:12}}>Greeks are point-in-time</strong>
          <p className="muted tiny" style={{marginTop:4}}>Delta, gamma, theta, vega, and IV reflect values at the time of entry — not live data. Members see these as entry-moment snapshots.</p>
        </div>
      </div>

      {success && <div className="sf-success"><Check size={14}/> {success}</div>}
      {error && <p className="checkout-error" style={{marginBottom:16}}>{error}</p>}

      {/* Signal type */}
      <div className="sf-section-label">Signal type</div>
      <div className="sf-seg-row" style={{marginBottom:20}}>
        <Seg label="Spot / Equity" active={!form.isOption} onClick={() => upd('isOption', false)} />
        <Seg label="Options contract" active={form.isOption} onClick={() => upd('isOption', true)} />
      </div>

      {/* Core setup */}
      <div className="sf-section-label">Core setup</div>
      <div className="sf-grid-3">
        <SF label="Ticker / asset" name="asset" placeholder="e.g. NVDA" />
        <Sel label="Market" name="market" options={['Stocks','Crypto']} />
        <Sel label="Direction" name="direction" options={['Long','Short']} />
      </div>
      <div className="sf-grid-3">
        <Sel label="Status" name="status" options={['Active','Watching','Closed','Stopped']} />
        <SF label="Timeframe" name="timeframe" placeholder="e.g. 2–5 days" />
        <Sel label="Risk" name="risk" options={['Low','Medium','Moderate','Elevated','High']} />
      </div>
      <div className="sf-grid-3">
        <SF label={form.isOption ? 'Debit / entry' : 'Entry'} name="entry" placeholder="$3.42" />
        <SF label="Target" name="target" placeholder="$5.10" />
        <SF label="Stop" name="stop" placeholder="$2.10" />
      </div>

      {/* Options-specific fields */}
      {form.isOption && (<>
        <div className="sf-section-label" style={{marginTop:8}}>Contract details</div>
        <div className="sf-seg-row" style={{marginBottom:16}}>
          <Seg label="Call" active={form.optionType === 'Call'} onClick={() => upd('optionType', 'Call')} />
          <Seg label="Put" active={form.optionType === 'Put'} onClick={() => upd('optionType', 'Put')} />
        </div>
        <div className="sf-grid-2">
          <SF label="Contract" name="contract" placeholder="NVDA 22 AUG 26 130 C" />
          <SF label="Expiration" name="expiration" placeholder="Aug 22, 2026" />
        </div>
        <div className="sf-grid-3">
          <SF label="Strike" name="strike" placeholder="$130.00" />
          <SF label="Premium" name="premium" placeholder="$3.42" />
          <SF label="Bid / Ask" name="bid" placeholder="$3.38" />
        </div>
        <div className="sf-section-label" style={{marginTop:4}}>Greeks & liquidity (at entry)</div>
        <div className="sf-grid-4">
          <SF label="IV" name="impliedVolatility" placeholder="48.6%" />
          <SF label="Delta Δ" name="delta" placeholder="0.42" />
          <SF label="Gamma Γ" name="gamma" placeholder="0.018" />
          <SF label="Theta Θ" name="theta" placeholder="-0.11" />
        </div>
        <div className="sf-grid-3">
          <SF label="Vega V" name="vega" placeholder="0.19" />
          <SF label="Open interest" name="openInterest" placeholder="18,420" />
          <SF label="Ask" name="ask" placeholder="$3.46" />
        </div>
      </>)}

      {/* Analysis */}
      <div className="sf-section-label" style={{marginTop:8}}>Wick's read</div>
      <SF label="Analysis" name="analysis" placeholder="Explain the setup, context, and invalidation level..." multiline />

      <div style={{display:'flex',gap:10,marginTop:8,alignItems:'center'}}>
        <button className="button button-dark" onClick={onSubmit} disabled={submitting} data-testid="button-publish-signal">
          {submitting ? 'Saving…' : editingId ? <><Pencil size={13}/> Update signal</> : <><Plus size={13}/> Publish signal</>}
        </button>
        {editingId && <button className="button button-outline" onClick={onCancel} data-testid="button-cancel-edit">Cancel</button>}
        <span className="muted tiny" style={{marginLeft:4}}>Educational content only — not investment advice.</span>
      </div>
    </div>
  );
}

function AdminSignalsPage() {
  const { user, getToken } = useAuth();
  const [form, setForm] = useState<SignalForm>(blankSignalForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanPreview, setScanPreview] = useState<string | null>(null);

  const upd = useCallback(<K extends keyof SignalForm>(k: K, v: SignalForm[K]) => {
    setForm((c) => ({ ...c, [k]: v }));
    setSuccess('');
  }, []);

  const scanScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanError('');
    setSuccess('');

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    }).catch(() => null);

    if (!dataUrl) { setScanError('Could not read the image file. Try another screenshot.'); return; }
    setScanPreview(dataUrl);
    // Strip the data URL prefix — the API expects raw base64.
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');

    setScanning(true);
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/admin/extract-signal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { error?: string };
        setScanError(d.error ?? 'Could not read the screenshot. Fill in the fields manually.');
        return;
      }
      const extracted = await r.json() as Record<string, unknown>;
      // Prefill only the recognised form fields; coerce numeric Greeks to strings.
      setForm((prev) => {
        const next: SignalForm = { ...prev };
        const strKeys: (keyof SignalForm)[] = ['asset','timeframe','entry','target','stop','risk','analysis','contract','expiration','strike','premium','bid','ask','impliedVolatility','delta','gamma','theta','vega','openInterest'];
        for (const k of strKeys) {
          const v = extracted[k];
          if (v !== undefined && v !== null) (next[k] as string) = String(v);
        }
        if (extracted.market === 'Stocks' || extracted.market === 'Crypto') next.market = extracted.market;
        if (extracted.direction === 'Long' || extracted.direction === 'Short') next.direction = extracted.direction;
        if (extracted.optionType === 'Call' || extracted.optionType === 'Put') next.optionType = extracted.optionType;
        if (typeof extracted.isOption === 'boolean') next.isOption = extracted.isOption;
        return next;
      });
    } catch {
      setScanError('AI screenshot scanning is unavailable right now. Fill in the fields manually.');
    } finally {
      setScanning(false);
    }
  };

  const fetchSignals = useCallback(async () => {
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/signals'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (r.ok) { const d = await r.json() as { signals: Signal[] }; setSignals(d.signals ?? []); }
    } catch { /* ignore */ }
    finally { setLoadingSignals(false); }
  }, [getToken]);

  useEffect(() => { void fetchSignals(); }, [fetchSignals]);

  if (user?.role !== 'admin') return <div className="page"><div className="empty-state"><ShieldCheck size={24}/><h3>Admin only</h3><p>This room is not accessible to members.</p></div></div>;

  const startEdit = (s: Signal) => {
    setEditingId(s.id);
    setError(''); setSuccess('');
    setForm({
      asset: s.asset, market: s.market, direction: s.direction, status: s.status,
      timeframe: s.timeframe, entry: s.entry, target: s.target, stop: s.stop,
      risk: s.risk, analysis: s.analysis, isOption: s.isOption ?? false,
      optionType: (s.optionType as 'Call' | 'Put') ?? 'Call',
      contract: s.contract ?? '', expiration: s.expiration ?? '', strike: s.strike ?? '',
      premium: s.premium ?? '', bid: s.bid ?? '', ask: s.ask ?? '',
      impliedVolatility: s.impliedVolatility ?? '',
      delta: s.delta != null ? String(s.delta) : '',
      gamma: s.gamma != null ? String(s.gamma) : '',
      theta: s.theta != null ? String(s.theta) : '',
      vega: s.vega != null ? String(s.vega) : '',
      openInterest: s.openInterest ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditingId(null); setForm(blankSignalForm); setError(''); setSuccess(''); };

  const submit = async () => {
    if (![form.asset, form.timeframe, form.entry, form.target, form.stop, form.analysis].every((v) => v.trim())) {
      setError('Fill in all required fields: ticker, timeframe, entry, target, stop, and analysis.'); return;
    }
    setError(''); setSubmitting(true);
    const isEdit = !!editingId;
    // For PATCH: send null to explicitly clear a nullable column (JSON.stringify keeps null, drops undefined).
    // For POST: send undefined to omit optional fields from the body entirely.
    const optStr = (s: string, upper = false): string | null | undefined => {
      const t = s.trim();
      if (t) return upper ? t.toUpperCase() : t;
      return isEdit ? null : undefined;
    };
    const optNum = (s: string): number | null | undefined => {
      const t = s.trim();
      if (t) return Number(t);
      return isEdit ? null : undefined;
    };

    const optionFields: Record<string, unknown> = form.isOption
      ? {
          optionType: form.optionType,
          contract: optStr(form.contract, true),
          expiration: optStr(form.expiration),
          strike: optStr(form.strike),
          premium: optStr(form.premium),
          bid: optStr(form.bid),
          ask: optStr(form.ask),
          impliedVolatility: optStr(form.impliedVolatility),
          delta: optNum(form.delta),
          gamma: optNum(form.gamma),
          theta: optNum(form.theta),
          vega: optNum(form.vega),
          openInterest: optStr(form.openInterest),
        }
      : {
          // Spot signal: clear all option columns when editing, omit when creating.
          optionType: isEdit ? null : undefined,
          contract: isEdit ? null : undefined,
          expiration: isEdit ? null : undefined,
          strike: isEdit ? null : undefined,
          premium: isEdit ? null : undefined,
          bid: isEdit ? null : undefined,
          ask: isEdit ? null : undefined,
          impliedVolatility: isEdit ? null : undefined,
          delta: isEdit ? null : undefined,
          gamma: isEdit ? null : undefined,
          theta: isEdit ? null : undefined,
          vega: isEdit ? null : undefined,
          openInterest: isEdit ? null : undefined,
        };

    const payload: Record<string, unknown> = {
      asset: form.asset.trim().toUpperCase(), market: form.market, direction: form.direction,
      status: form.status, entry: form.entry.trim(), target: form.target.trim(),
      stop: form.stop.trim(), timeframe: form.timeframe.trim(), risk: form.risk.trim(),
      analysis: form.analysis.trim(), isOption: form.isOption,
      ...optionFields,
    };
    try {
      const url = editingId ? apiPath(`/signals/${editingId}`) : apiPath('/signals');
      const method = editingId ? 'PATCH' : 'POST';
      const token = await getToken();
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
      if (!r.ok) { const d = await r.json() as { error: string }; throw new Error(d.error); }
      setSuccess(editingId ? 'Signal updated successfully.' : 'Signal published — live in the member feed.');
      setEditingId(null); setForm(blankSignalForm);
      await fetchSignals();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save signal. Try again.'); }
    finally { setSubmitting(false); }
  };

  const updateStatus = async (id: string, newStatus: SignalStatus) => {
    setUpdatingId(id);
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/signals/${id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ status: newStatus }) });
      if (!r.ok) throw new Error('Failed');
      setSignals((prev) => prev.map((s) => s.id === id ? { ...s, status: newStatus } : s));
    } catch { setError('Failed to update status.'); }
    finally { setUpdatingId(null); }
  };

  const formatDate = (s: Signal) => {
    const raw = s.createdAt ?? s.postedAt;
    if (!raw) return '';
    try { return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return raw; }
  };

  return <div className="page">
    <PageHeading
      eyebrow="Admin · Signal studio"
      title={editingId ? 'Edit signal.' : 'Publish signals.'}
      description="Posts appear immediately in the member feed. Greeks shown are point-in-time values at entry — not live data."
    />

    <div className="surface animate-in" style={{padding:'24px 28px',marginBottom:24}}>
      <div className="sf-section-label" style={{marginTop:0}}>AI screenshot scan</div>
      <div style={{display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
        {scanPreview
          ? <img src={scanPreview} alt="Screenshot preview" style={{width:120,height:80,objectFit:'cover',borderRadius:10,border:'1px solid var(--border)'}} />
          : <div style={{width:120,height:80,display:'grid',placeItems:'center',border:'1px dashed var(--border)',borderRadius:10,color:'var(--muted-foreground)'}}><Newspaper size={22} /></div>
        }
        <div style={{flex:1,minWidth:220}}>
          <p className="muted tiny" style={{marginBottom:12}}>
            {scanning ? 'Scanning screenshot with AI…' : scanPreview ? 'Screenshot loaded. Review and edit fields below before publishing.' : 'Upload a trade screenshot and the fields below auto-fill from the image.'}
          </p>
          <label className="button button-dark" style={{fontSize:12,cursor:scanning ? 'default' : 'pointer',opacity:scanning ? 0.6 : 1}}>
            <Plus size={13} /> {scanning ? 'Scanning…' : scanPreview ? 'Scan different screenshot' : 'Choose screenshot'}
            <input type="file" accept="image/*" onChange={(e) => void scanScreenshot(e)} disabled={scanning} style={{display:'none'}} data-testid="input-scan-screenshot" />
          </label>
          {scanError && <p className="checkout-error" style={{marginTop:12}}>{scanError}</p>}
        </div>
      </div>
    </div>

    <AdminSignalForm
      form={form} editingId={editingId} submitting={submitting} error={error} success={success}
      upd={upd} onSubmit={() => void submit()} onCancel={cancelEdit}
    />

    {/* Existing signals */}
    <div style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <span className="eyebrow">Published signals ({signals.length})</span>
    </div>
    {loadingSignals
      ? <div className="empty-state" style={{paddingTop:40}}><Radio size={22}/><h3>Loading…</h3></div>
      : signals.length === 0
        ? <div className="empty-state"><Radio size={24}/><h3>No signals yet</h3><p>Publish your first signal above.</p></div>
        : <div className="surface animate-in delay-1">
            <div className="sf-list-head"><span>Asset</span><span>Direction</span><span>Status</span><span>Posted</span><span>Actions</span></div>
            {signals.map((s) => (
              <div key={s.id} className="sf-list-row" data-testid={`admin-signal-row-${s.id}`}>
                <div>
                  <strong style={{fontSize:13}}>{s.asset}</strong>
                  {s.isOption && <span className="option-tag" style={{marginLeft:6}}>{s.optionType}</span>}
                  <span className="muted tiny" style={{display:'block',marginTop:2}}>{s.market} · {s.timeframe}</span>
                </div>
                <span className={`direction ${s.direction.toLowerCase()}`} style={{fontSize:12}}>{s.direction}</span>
                <span>
                  <select
                    className="sf-status-select"
                    value={s.status}
                    disabled={updatingId === s.id}
                    onChange={(e) => void updateStatus(s.id, e.target.value as SignalStatus)}
                    data-testid={`select-status-${s.id}`}
                  >
                    {(['Active','Watching','Closed','Stopped'] as SignalStatus[]).map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </span>
                <span className="muted tiny">{formatDate(s)}</span>
                <span>
                  <button
                    className="button button-outline"
                    style={{fontSize:11,padding:'5px 12px'}}
                    onClick={() => startEdit(s)}
                    data-testid={`button-edit-signal-${s.id}`}
                  >
                    <Pencil size={11}/> Edit
                  </button>
                </span>
              </div>
            ))}
          </div>
    }
  </div>;
}

// ── Admin: User Management ─────────────────────────────────────────────────────
interface AdminUser { id: string; email: string; name: string; avatarUrl: string | null; role: string; createdAt: string; }

function AdminUsersPage() {
  const { user, getToken: getAdminToken } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const token = await getAdminToken();
        const r = await fetch(apiPath('/admin/users'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) throw new Error('Forbidden');
        const d = await r.json() as { users: AdminUser[] };
        setUsers(d.users);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [getAdminToken]);

  const toggleRole = async (target: AdminUser) => {
    const newRole = target.role === 'admin' ? 'member' : 'admin';
    setUpdating(target.id);
    try {
      const token = await getAdminToken();
      const r = await fetch(apiPath(`/admin/users/${target.id}/role`), { method:'PATCH', headers:{'Content-Type':'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {})}, body: JSON.stringify({ role: newRole }) });
      if (!r.ok) { const d = await r.json() as { error: string }; throw new Error(d.error); }
      setUsers((prev) => prev.map((u) => u.id === target.id ? { ...u, role: newRole } : u));
    } catch (e) { setError((e as Error).message); }
    finally { setUpdating(null); }
  };

  if (user?.role !== 'admin') return <div className="page"><div className="empty-state"><ShieldCheck size={24}/><h3>Admin only</h3></div></div>;

  return <div className="page">
    <PageHeading eyebrow="Admin · Users" title="Member roster." description="Grant or revoke admin permissions. The primary admin account cannot be demoted." />
    {error && <p className="checkout-error" style={{marginBottom:16}}>{error}</p>}
    {loading ? <div className="empty-state" style={{paddingTop:40}}><UserRound size={22}/><h3>Loading roster…</h3></div> : (
      <div className="surface animate-in">
        <div className="table-row table-head"><span>Member</span><span>Email</span><span>Plan</span><span>Role</span><span>Action</span></div>
        {users.map((u) => (
          <div key={u.id} className="table-row" style={{alignItems:'center'}}>
            <div className="asset-name"><strong>{u.name}</strong><span>Joined {new Date(u.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span></div>
            <span className="muted tiny">{u.email}</span>
            <span><span className={`status-pill status-active`}>member</span></span>
            <span><span className={`status-pill ${u.role === 'admin' ? 'status-active' : 'status-watching'}`}>{u.role}</span></span>
            <span>
              {u.email === 'bettstahlik@gmail.com'
                ? <span className="muted tiny">Primary admin</span>
                : <button className="button button-outline" style={{fontSize:11,padding:'4px 12px'}} disabled={updating === u.id} onClick={() => void toggleRole(u)} data-testid={`button-toggle-role-${u.id}`}>
                    {updating === u.id ? '…' : u.role === 'admin' ? 'Revoke admin' : 'Grant admin'}
                  </button>
              }
            </span>
          </div>
        ))}
      </div>
    )}
  </div>;
}

// ── Router ─────────────────────────────────────────────────────────────────────
function AppRouter() {
  const [isLanding] = useRoute('/');
  // Note: '/sign-in/:rest*' does NOT match bare '/sign-in' in wouter v3, so
  // match the exact path and nested paths separately.
  const [isSignInExact] = useRoute('/sign-in');
  const [isSignInNested] = useRoute('/sign-in/*');
  const [isSignUpExact] = useRoute('/sign-up');
  const [isSignUpNested] = useRoute('/sign-up/*');
  const isSignIn = isSignInExact || isSignInNested;
  const isSignUp = isSignUpExact || isSignUpNested;
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && (isSignIn || isSignUp)) {
      setLocation('/app/home');
    }
  }, [isAuthenticated, isLoading, isSignIn, isSignUp, setLocation]);

  // Redirect authenticated members away from landing
  useEffect(() => {
    if (!isLoading && isLanding) {
      const params = new URLSearchParams(window.location.search);
      const isSuccessCallback = params.get('checkout') === 'success' || params.get('auth') === 'success';

      if (isSuccessCallback) {
        setLocation('/app/home');
        return;
      }

      if (isAuthenticated && isDevAuthMode) return;

      if (isAuthenticated) {
        setLocation('/app/home');
      }
    }
  }, [isAuthenticated, isLanding, isLoading, isDevAuthMode, setLocation]);

  if (!isLoading && isAuthenticated && (isSignIn || isSignUp)) return null;
  if (isSignIn) return <SignInPage />;
  if (isSignUp) return <SignUpPage />;
  if (isLanding) return <Landing />;

  return <AuthGate>
    <MemberShell>
      <Switch>
        <Route path="/app/home">
          <RequireSubscription title="Your desk is one step away." description="Subscribe to a plan to unlock the morning brief, live signals, and market data.">
            <HomePage />
          </RequireSubscription>
        </Route>
        <Route path="/app/signals">
          <RequireSubscription title="Signals are for members." description="An active subscription unlocks the daily signal stream with full Greeks and levels.">
            <SignalsPage />
          </RequireSubscription>
        </Route>
        <Route path="/app/market">
          <RequireSubscription title="The board is for members." description="Subscribe to see live delayed quotes across indices, sectors, mega-caps, and crypto.">
            <MarketPage />
          </RequireSubscription>
        </Route>
        <Route path="/app/news">
          <RequireSubscription title="The newsroom is for members." description="Subscribe to unlock live market headlines curated for the desk.">
            <NewsPage />
          </RequireSubscription>
        </Route>
        <Route path="/app/community"><CommunityPage /></Route>
        <Route path="/app/mentorship"><MentorshipPage /></Route>
        <Route path="/app/profile"><ProfilePage /></Route>
        <Route path="/app/admin/signals"><AdminSignalsPage /></Route>
        <Route path="/app/admin/users"><AdminUsersPage /></Route>
        <Route><NotFound /></Route>
      </Switch>
    </MemberShell>
  </AuthGate>;
}

function NotFound() {
  return <div className="page"><div className="empty-state"><X size={24} /><h3>That room is not on the floor plan.</h3><p>Return to the member desk and continue from there.</p><Link href="/app/home" className="button button-dark" style={{marginTop:20}} data-testid="link-return-home">Return home</Link></div></div>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const basePath = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

  function stripBase(path: string) {
    return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => { setLocation(stripBase(to)); }}
      routerReplace={(to) => { setLocation(stripBase(to)); }}
    >
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ClerkProvider>
  );
}

function DevAuthRoutes() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={(import.meta.env.BASE_URL as string).replace(/\/$/, '')}>
      {isDevAuthMode ? <DevAuthRoutes /> : <ClerkProviderWithRoutes />}
    </WouterRouter>
  );
}

function isWithinGracePeriod(subscription: { status: string; currentPeriodEnd: string | null } | null): boolean {
  if (!subscription || subscription.status !== 'past_due' || !subscription.currentPeriodEnd) return false;
  const graceCutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return new Date(subscription.currentPeriodEnd) >= graceCutoff;
}
