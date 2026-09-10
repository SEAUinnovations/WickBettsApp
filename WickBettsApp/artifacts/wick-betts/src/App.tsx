import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from 'wouter';
import {
  Activity, AlertTriangle, ArrowRight, Award, Bell, BookMarked, BookOpen, CalendarDays, CandlestickChart, Camera, Check,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, Crown, ExternalLink, Filter, Flag, Flame,
  FlaskConical, Gamepad2, GitCompare, GraduationCap, Heart, Layers, LayoutDashboard, LoaderCircle, LockKeyhole,
  LogOut, Maximize2, MessageCircle, Minimize2, Minus, Newspaper, PanelLeft, Pause, Pencil, Percent, Play, PlayCircle, Plus, Radio, Rocket, RotateCcw,
  Settings, ShieldCheck, SlidersHorizontal, Sparkles, Star, Swords, Target, TrendingUp, Trash2, Trophy,
  UserCheck, UserPlus, UserRound, WalletCards, X, Chrome, Zap,
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
type SignalStyle = 'Day Trade' | 'Swing' | 'Buy & Hold' | 'LEAPS';
type SignalResultTag = 'Pending' | 'Green' | 'Missed';
type Direction = 'Long' | 'Short';
type Thread = 'Signals' | 'News' | 'Community Chat' | 'Shared Signals';

type Member = {
  name: string; plan: Plan; joinedDate: string; timezone: string; nextBillingDate: string;
  mentorshipEnds: string; weeklyCallsUsed: number;
};
type Signal = {
  id: string; asset: string; sector?: string | null; market: 'Stocks' | 'Crypto'; direction: Direction; entry: string;
  target: string; stop: string; timeframe: string; risk: string; status: SignalStatus; style?: SignalStyle;
  postedAt?: string; createdAt?: string; analysis: string; isOption?: boolean; optionType?: string;
  contract?: string; contractAmount?: number; expiration?: string; strike?: string; premium?: string; bid?: string; ask?: string;
  impliedVolatility?: string; delta?: number; gamma?: number; theta?: number; vega?: number;
  openInterest?: string; analysisImageDataUrl?: string | null;
  resultTag?: SignalResultTag; resultPercent?: number | null;
};
/** Green/Missed/Pending scoreboard summary — see computeScoreboardStats in routes/signals.ts. */
type ScoreboardStats = { green: number; missed: number; pending: number; winRate: number | null; targetPercent: number };
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
              <ul className="plan-list"><li>Daily long and short signals</li><li>Options contracts with full Greeks</li><li>Signal history and status changes</li><li>Market news with Wick commentary</li><li>Community access — private threads with the desk</li><li>Full Learning tab — beginner-to-expert lessons and arcade games</li></ul>
              <button className="button button-dark" data-testid="button-plan-signals" onClick={() => void handlePlan('signals')} disabled={checkoutLoading !== null}>
                {checkoutLoading === 'signals' ? 'Redirecting…' : 'Join the daily desk'} <ArrowRight size={14} />
              </button>
            </article>
            <article className="plan-card featured animate-in delay-2">
              <span className="plan-tag">Limited access</span><span className="eyebrow light">The closer room</span><h3>Mentorship</h3>
              <div className="price">$500 <small>/ month</small></div>
              <p className="plan-detail">Everything in Signals, plus one calm hour each week to pressure-test your process with a Wick mentor.</p>
              <ul className="plan-list"><li>Everything in Signals — community access and the full Learning tab included</li><li>Options contract analysis</li><li>Weekly one-hour private call</li><li>Live calendar booking</li><li>Trade reviews — bring real setups and get them looked at directly</li></ul>
              <button className="button button-primary" data-testid="button-plan-mentorship" onClick={() => void handlePlan('mentorship')} disabled={checkoutLoading !== null}>
                {checkoutLoading === 'mentorship' ? 'Redirecting…' : 'Enter the closer room'} <ArrowRight size={14} />
              </button>
            </article>
            <article className="plan-card animate-in delay-3">
              <span className="eyebrow">The full membership</span><h3>Membership</h3>
              <div className="price">Premium <small>/ month</small></div>
              <p className="plan-detail">A complete member path for desks that want broad platform access in one subscription.</p>
              <ul className="plan-list"><li>Community access — private threads with the desk and other members</li><li>Full Learning tab — beginner-to-expert lessons and arcade games</li><li>Trade reviews with the desk</li><li>Signal alert emails and market news — upgrade to Signals for the full feed with exact entries and exits</li><li>Manage or upgrade anytime from your billing portal</li></ul>
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
// Scoreboard summary — Green/Missed win rate among decided calls, out of the
// signals the caller already has (see computeScoreboardStats in
// routes/signals.ts, which returns this alongside the signal list itself).
function ScoreboardSummary({ stats }: { stats: ScoreboardStats | null }) {
  if (!stats || stats.green + stats.missed + stats.pending === 0) return null;
  return (
    <div className="surface animate-in scoreboard-summary" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', padding: '16px 20px', marginBottom: 16 }} data-testid="scoreboard-summary">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <Trophy size={16} color="var(--muted)" />
        <strong style={{ fontSize: 20 }}>{stats.winRate !== null ? `${stats.winRate}%` : '—'}</strong>
        <span className="muted tiny">win rate · {stats.targetPercent}%+ move to count</span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span className="tiny"><span className="status-pill status-active" style={{ marginRight: 6 }}>Green</span>{stats.green}</span>
        <span className="tiny"><span className="status-pill status-stopped" style={{ marginRight: 6 }}>Missed</span>{stats.missed}</span>
        <span className="tiny"><span className="status-pill status-watching" style={{ marginRight: 6 }}>Pending</span>{stats.pending}</span>
      </div>
    </div>
  );
}

function SignalsPage() {
  const { getToken, openBillingPortal, startCheckout, subscription } = useAuth();
  const [market, setMarket] = useState<'All' | 'Stocks' | 'Crypto'>('All');
  const [status, setStatus] = useState<'All' | SignalStatus>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  // Start empty — never pre-populate with bundled data so lapsed users see no paid content.
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<ScoreboardStats | null>(null);
  const [loadError, setLoadError] = useState('');
  const [subRequired, setSubRequired] = useState(false);
  // Membership doesn't include the Signals feed (exact entries/targets/
  // stops/contract detail) — only the Signals and Mentorship plans do. See
  // requireSignalsPlan in artifacts/api-server/src/routes/signals.ts.
  const [planUpgradeRequired, setPlanUpgradeRequired] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const token = await getToken();
        const r = await fetch(apiPath('/signals'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (r.status === 403) {
          const body = await r.json() as { code?: string };
          if (body.code === 'SIGNALS_PLAN_REQUIRED') {
            setPlanUpgradeRequired(true);
            setSignals([]);
            return;
          }
          if (body.code === 'SUBSCRIPTION_REQUIRED') {
            setSubRequired(true);
            setSignals([]);
            return;
          }
        }
        if (!r.ok) { setLoadError('Unable to load signals. Please try again shortly.'); return; }
        const data = await r.json() as { signals: Signal[]; stats?: ScoreboardStats };
        setSignals(data.signals ?? []);
        setStats(data.stats ?? null);
      } catch {
        setLoadError('Unable to load signals. Please try again shortly.');
      }
    })();
  }, [getToken]);

  if (planUpgradeRequired) {
    const doUpgrade = async () => {
      setUpgrading(true);
      try { await startCheckout('signals'); } finally { setUpgrading(false); }
    };
    return <div className="page">
      <PageHeading eyebrow="The daily desk" title="Signals." />
      <div className="surface animate-in" style={{ padding: 40, textAlign: 'center' }}>
        <LockKeyhole size={28} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.4 }} />
        <h3 style={{ marginBottom: 8 }}>Upgrade your subscription</h3>
        <p className="muted" style={{ maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.6 }}>
          This page gives exact contract entries, exits, and setup detail — included on the Signals and Mentorship plans, not on Membership.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="button button-dark" onClick={() => void doUpgrade()} disabled={upgrading}>
            <ArrowRight size={13} /> {upgrading ? 'Loading…' : 'Upgrade to Signals · $250'}
          </button>
        </div>
      </div>
    </div>;
  }

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
    <ScoreboardSummary stats={stats} />
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
            <span>{signal.market}{signal.style ? ` · ${signal.style}` : ''} · {signal.postedAt}</span>
          </div>
          <span className={`direction ${signal.direction.toLowerCase()}`}>{signal.direction}</span>
          <span className="signal-cell"><small>{signal.isOption ? 'Debit' : 'Entry'}</small>{signal.entry}</span>
          <span className="signal-cell"><small>Target</small>{signal.target}</span>
          <span className="signal-cell"><small>Stop</small>{signal.stop}</span>
          <span className="signal-cell">
            <span className={`status-pill status-${signal.status.toLowerCase()}`}>{signal.status}</span>
            {signal.resultTag && signal.resultTag !== 'Pending' && (
              <span className={`status-pill status-${signal.resultTag === 'Green' ? 'active' : 'stopped'}`} style={{ marginLeft: 6 }} title={signal.resultPercent != null ? `Best move: ${signal.resultPercent}%` : undefined}>
                {signal.resultTag}
              </span>
            )}
          </span>
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
                  <span>× {signal.contractAmount ?? 1} contract{(signal.contractAmount ?? 1) === 1 ? '' : 's'}</span>
                </div>
              )}
              <p className="signal-analysis">{signal.analysis}</p>
              {signal.analysisImageDataUrl && (
                <img
                  src={signal.analysisImageDataUrl}
                  alt={`${signal.asset} chart`}
                  style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12, marginTop: 10 }}
                />
              )}
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

interface CommunitySignal {
  id: string;
  authorId: string;
  authorName: string | null;
  asset: string;
  market: 'Stocks' | 'Crypto';
  direction: 'Long' | 'Short';
  entry: string;
  target: string;
  stop: string | null;
  note: string;
  status: 'Open' | 'Closed';
  createdAt: string;
  updatedAt: string;
  logoUrl: string | null;
}

function communityTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function CommunityPage() {
  const { getToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [thread, setThread] = useState<Thread>('Signals');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [reacted, setReacted] = useState<string[]>([]);
  const threadCopy: Record<Thread,string> = { Signals:'Levels, entries, and the discipline around a setup.', News:'The macro and company context behind today\'s board.', 'Community Chat':'A considered place to compare notes with other members.', 'Shared Signals':'Member-posted trade ideas. Follow other members and share your own setups.' };

  // Shared Signals — member-posted trade ideas, distinct from the Signals
  // thread above (which is Wick's curated feed). Its own table/endpoints
  // (GET/POST/PATCH/DELETE /api/community/signals, POST /api/community/follow/:id),
  // already used by the mobile app — this just wires the same API into the
  // website, which never had this tab.
  const [sharedSignals, setSharedSignals] = useState<CommunitySignal[]>([]);
  const [sharedLoading, setSharedLoading] = useState(true);
  const [sharedError, setSharedError] = useState('');
  const [following, setFollowing] = useState<string[]>([]);
  const [signalScope, setSignalScope] = useState<'All' | 'Following'>('All');
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [signalActionBusyId, setSignalActionBusyId] = useState<string | null>(null);
  const [csAsset, setCsAsset] = useState('');
  const [csMarket, setCsMarket] = useState<'Stocks' | 'Crypto'>('Stocks');
  const [csDirection, setCsDirection] = useState<'Long' | 'Short'>('Long');
  const [csEntry, setCsEntry] = useState('');
  const [csTarget, setCsTarget] = useState('');
  const [csStop, setCsStop] = useState('');
  const [csNote, setCsNote] = useState('');
  const [csSubmitting, setCsSubmitting] = useState(false);
  const [csError, setCsError] = useState('');

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

  const fetchSharedSignals = useCallback(async () => {
    setSharedLoading(true);
    setSharedError('');
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/community/signals'), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) { setSharedError('Could not load shared signals. Please try again.'); return; }
      const data = await r.json() as { signals: CommunitySignal[]; following: string[] };
      setSharedSignals(data.signals ?? []);
      setFollowing(data.following ?? []);
    } catch {
      setSharedError('Could not load shared signals. Please try again.');
    } finally {
      setSharedLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void fetchSharedSignals(); }, [fetchSharedSignals]);

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

  const removePost = async (postId: string) => {
    if (postId.startsWith('optimistic-')) return;
    if (!window.confirm('Delete this message?')) return;
    const prev = posts;
    setPosts((p) => p.filter((post) => post.id !== postId));
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/community/${postId}`), {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error('Failed');
    } catch {
      setPosts(prev);
    }
  };

  const submitSharedSignal = async () => {
    if (!csAsset.trim() || !csEntry.trim() || !csTarget.trim() || !csNote.trim() || csSubmitting) return;
    setCsSubmitting(true);
    setCsError('');
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/community/signals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          asset: csAsset.trim().toUpperCase(),
          market: csMarket,
          direction: csDirection,
          entry: csEntry.trim(),
          target: csTarget.trim(),
          stop: csStop.trim() || undefined,
          note: csNote.trim(),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not share your signal. Please try again.');
      }
      const data = await r.json() as { signal: CommunitySignal };
      setSharedSignals((prev) => [data.signal, ...prev]);
      setCsAsset(''); setCsEntry(''); setCsTarget(''); setCsStop(''); setCsNote('');
    } catch (err) {
      setCsError(err instanceof Error ? err.message : 'Could not share your signal. Please try again.');
    } finally {
      setCsSubmitting(false);
    }
  };

  const toggleFollow = async (targetId: string) => {
    if (followBusyId) return;
    setFollowBusyId(targetId);
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/community/follow/${targetId}`), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) return;
      const data = await r.json() as { following: boolean };
      setFollowing((prev) => (data.following ? [...prev, targetId] : prev.filter((id) => id !== targetId)));
    } finally {
      setFollowBusyId(null);
    }
  };

  const toggleSignalStatus = async (signal: CommunitySignal) => {
    if (signalActionBusyId) return;
    setSignalActionBusyId(signal.id);
    const nextStatus = signal.status === 'Open' ? 'Closed' : 'Open';
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/community/signals/${signal.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!r.ok) return;
      setSharedSignals((prev) => prev.map((s) => (s.id === signal.id ? { ...s, status: nextStatus } : s)));
    } finally {
      setSignalActionBusyId(null);
    }
  };

  const deleteSharedSignal = async (signal: CommunitySignal) => {
    if (signalActionBusyId) return;
    if (!window.confirm(`Delete your ${signal.asset} shared signal?`)) return;
    setSignalActionBusyId(signal.id);
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/community/signals/${signal.id}`), {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) return;
      setSharedSignals((prev) => prev.filter((s) => s.id !== signal.id));
    } finally {
      setSignalActionBusyId(null);
    }
  };

  const visibleSharedSignals = sharedSignals.filter(
    (s) => signalScope === 'All' || following.includes(s.authorId) || s.authorId === user?.id,
  );
  const shareDisabled = !csAsset.trim() || !csEntry.trim() || !csTarget.trim() || !csNote.trim() || csSubmitting;

  return <div className="page"><PageHeading eyebrow="The room" title="Community." description="Four official threads. No feed to scroll forever." />
    <section className="surface animate-in">
      <div className="thread-tabs">{(['Signals','News','Community Chat','Shared Signals'] as Thread[]).map((name) => <button key={name} className={`thread-tab ${thread === name ? 'active' : ''}`} onClick={() => setThread(name)} data-testid={`tab-thread-${name.toLowerCase().replace(' ','-')}`}>{name}</button>)}</div>
      <p className="thread-description">{threadCopy[thread]}</p>
      {thread === 'Shared Signals' ? (
        <>
          <div className="filter-bar">
            <button className={`filter-chip ${signalScope === 'All' ? 'selected' : ''}`} onClick={() => setSignalScope('All')} data-testid="filter-shared-scope-all">All</button>
            <button className={`filter-chip ${signalScope === 'Following' ? 'selected' : ''}`} onClick={() => setSignalScope('Following')} data-testid="filter-shared-scope-following">Following ({following.length})</button>
          </div>
          {sharedLoading ? (
            <div className="empty-state"><MessageCircle size={22} /><h3>Loading shared signals…</h3></div>
          ) : sharedError ? (
            <div className="empty-state">
              <MessageCircle size={22} />
              <h3>Something went wrong</h3>
              <p>{sharedError}</p>
              <button className="button button-dark" style={{ marginTop: 16 }} onClick={() => void fetchSharedSignals()} data-testid="button-retry-shared-signals">Try again</button>
            </div>
          ) : visibleSharedSignals.length === 0 ? (
            <div className="empty-state">
              <MessageCircle size={22} />
              <h3>No shared signals yet</h3>
              <p>{signalScope === 'Following' ? "You're not following anyone yet — switch to All to find members to follow." : 'Be the first to post one below.'}</p>
            </div>
          ) : (
            <div className="messages">{visibleSharedSignals.map((s) => {
              const author = s.authorName ?? 'Member';
              const isOwn = s.authorId === user?.id;
              const isFollowing = following.includes(s.authorId);
              return (
                <article className="message" key={s.id}>
                  <div className="message-top">
                    <div className="author"><span className="avatar">{initials(author)}</span><div><strong>{author}</strong><span>{communityTime(s.createdAt)}</span></div></div>
                    {!isOwn && (
                      <button
                        className="button button-outline"
                        style={{ minHeight: 30, padding: '5px 12px', fontSize: 10 }}
                        disabled={followBusyId === s.authorId}
                        onClick={() => void toggleFollow(s.authorId)}
                        data-testid={`button-follow-${s.authorId}`}
                      >
                        {isFollowing ? <><UserCheck size={12} /> Following</> : <><UserPlus size={12} /> Follow</>}
                      </button>
                    )}
                  </div>
                  <div style={{ margin: '15px 0 0 37px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="asset-name"><strong>{s.asset}</strong></span>
                    <span className={`direction ${s.direction.toLowerCase()}`}>{s.direction}</span>
                    <span className="option-tag">{s.market}</span>
                    <span className={`status-pill ${s.status === 'Open' ? 'status-active' : 'status-closed'}`}>{s.status}</span>
                  </div>
                  <div style={{ margin: '12px 0 0 37px', display: 'flex', gap: 24 }}>
                    <span className="signal-cell"><small>Entry</small>{s.entry}</span>
                    <span className="signal-cell"><small>Target</small>{s.target}</span>
                    {s.stop && <span className="signal-cell"><small>Stop</small>{s.stop}</span>}
                  </div>
                  <p className="message-text">{s.note}</p>
                  {(isOwn || isAdmin) && (
                    <div className="message-bottom">
                      {isOwn && (
                        <button className="reaction" onClick={() => void toggleSignalStatus(s)} disabled={signalActionBusyId === s.id} data-testid={`button-toggle-status-${s.id}`}>
                          {s.status === 'Open' ? <Check size={11} /> : <RotateCcw size={11} />} {s.status === 'Open' ? 'Mark closed' : 'Reopen'}
                        </button>
                      )}
                      <button className="reaction" onClick={() => void deleteSharedSignal(s)} disabled={signalActionBusyId === s.id} data-testid={`button-delete-shared-signal-${s.id}`}>
                        <Trash2 size={11} /> {isOwn ? 'Delete' : 'Remove'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}</div>
          )}
          <div className="composer">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={csAsset} onChange={(e) => setCsAsset(e.target.value)} placeholder="Ticker, e.g. NVDA" disabled={csSubmitting}
                style={{ padding: 12, background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                data-testid="input-shared-signal-ticker" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['Stocks', 'Crypto'] as const).map((m) => (
                  <button key={m} className={`filter-chip ${csMarket === m ? 'selected' : ''}`} onClick={() => setCsMarket(m)} disabled={csSubmitting} data-testid={`button-shared-signal-market-${m.toLowerCase()}`}>{m}</button>
                ))}
                {(['Long', 'Short'] as const).map((d) => (
                  <button key={d} className={`filter-chip ${csDirection === d ? 'selected' : ''}`} onClick={() => setCsDirection(d)} disabled={csSubmitting} data-testid={`button-shared-signal-direction-${d.toLowerCase()}`}>{d}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={csEntry} onChange={(e) => setCsEntry(e.target.value)} placeholder="Entry" disabled={csSubmitting}
                  style={{ flex: 1, padding: 12, background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                  data-testid="input-shared-signal-entry" />
                <input value={csTarget} onChange={(e) => setCsTarget(e.target.value)} placeholder="Target" disabled={csSubmitting}
                  style={{ flex: 1, padding: 12, background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                  data-testid="input-shared-signal-target" />
                <input value={csStop} onChange={(e) => setCsStop(e.target.value)} placeholder="Stop (optional)" disabled={csSubmitting}
                  style={{ flex: 1, padding: 12, background: 'var(--input)', border: '1px solid var(--border)', color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                  data-testid="input-shared-signal-stop" />
              </div>
              <textarea value={csNote} onChange={(e) => setCsNote(e.target.value)} placeholder="Why are you in this trade?" disabled={csSubmitting} data-testid="input-shared-signal-note" />
            </div>
            {csError && <p className="checkout-error" style={{ marginTop: 8 }}>{csError}</p>}
            <div className="composer-footer">
              <span>Member-shared ideas, not reviewed by Wick Betts. Educational only.</span>
              <button className="button button-primary" onClick={() => void submitSharedSignal()} disabled={shareDisabled} data-testid="button-share-signal">
                {csSubmitting ? 'Sharing…' : <>Share to community <ArrowRight size={13} /></>}
              </button>
            </div>
          </div>
        </>
      ) : loading ? (
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
          const canRemove = message.authorId === user?.id || isAdmin;
          return (
            <article className="message" key={message.id}>
              <div className="message-top">
                <div className="author"><span className="avatar">{initials(author)}</span><div><strong>{author}</strong><span>{communityTime(message.createdAt)}</span></div></div>
              </div>
              <p className="message-text">{message.text}</p>
              <div className="message-bottom">
                <button className={`reaction ${reacted.includes(message.id) ? 'reacted' : ''}`} onClick={() => setReacted(reacted.includes(message.id) ? reacted.filter((id) => id !== message.id) : [...reacted, message.id])} data-testid={`button-react-message-${message.id}`}><Heart size={11} /> {reacted.includes(message.id) ? 1 : 0}</button>
                {canRemove && (
                  <button className="reaction" onClick={() => void removePost(message.id)} data-testid={`button-delete-message-${message.id}`}>
                    <Trash2 size={11} /> Delete
                  </button>
                )}
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
  /** At most 2 short (under 10 min), duration-verified YouTube videos related to this lesson. */
  videos?: { title: string; url: string; duration: string }[];
}

interface LearningProgress {
  completedModules: string[];
  completedTracks: LearningLevel[];
  xp: number;
  streakDays: number;
  lastVisit: string | null;
  candleGame: { bestScore: number; bestStreak: number; plays: number };
  triviaGame: { bestScore: number; plays: number };
  liveSimGame: { bestEquity: number; timesBreached: number; plays: number };
}

const LEARNING_STORAGE_PREFIX = 'wb-learning-progress';

function blankLearningProgress(): LearningProgress {
  return {
    completedModules: [],
    completedTracks: [],
    xp: 0,
    streakDays: 0,
    lastVisit: null,
    candleGame: { bestScore: 0, bestStreak: 0, plays: 0 },
    triviaGame: { bestScore: 0, plays: 0 },
    liveSimGame: { bestEquity: 0, timesBreached: 0, plays: 0 },
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
      liveSimGame: { ...fallback.liveSimGame, ...parsed.liveSimGame },
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
const TRACK_BONUS_XP = 100;
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

// ── Learning: live trading simulator engine ───────────────────────────────────────
// Pure, framework-agnostic logic for a fully client-side, always-simulated
// candlestick feed plus a paper-money order book — ported 1:1 from the
// mobile app's lib/liveSimEngine.ts + lib/contractSpecs.ts so both platforms
// share identical simulation rules. No real market data, no real broker, and
// no real money ever touches this: every price here is a random walk
// generated in the browser.
interface FuturesContractSpec { symbol: string; name: string; pointValue: number; tickSize: number; tickValue: number }
const NQ_SPEC: FuturesContractSpec = { symbol: 'NQ', name: 'E-mini Nasdaq-100', pointValue: 20, tickSize: 0.25, tickValue: 5 };
const MNQ_SPEC: FuturesContractSpec = { symbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', pointValue: 2, tickSize: 0.25, tickValue: 0.5 };
interface ForexLotSpec { id: 'standard' | 'mini' | 'micro' | 'nano'; label: string; units: number; pipValue: number }
const FOREX_LOTS: ForexLotSpec[] = [
  { id: 'standard', label: 'Standard Lot', units: 100_000, pipValue: 10 },
  { id: 'mini', label: 'Mini Lot', units: 10_000, pipValue: 1 },
  { id: 'micro', label: 'Micro Lot', units: 1_000, pipValue: 0.1 },
  { id: 'nano', label: 'Nano Lot', units: 100, pipValue: 0.01 },
];

type SimTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';
const SIM_TIMEFRAMES: SimTimeframe[] = ['1m', '5m', '15m', '30m', '1h'];

interface SimCandle { time: number; open: number; high: number; low: number; close: number }
type SimSide = 'long' | 'short';
interface SimPosition {
  side: SimSide;
  qty: number;
  avgPrice: number;
  takeProfit?: number | null;
  stopLoss?: number | null;
}
interface SimTradeLog { side: SimSide | 'flat'; qty: number; price: number; pnl: number; time: number }
interface SimAccountState {
  startingBalance: number;
  realizedPnl: number;
  position: SimPosition | null;
  trades: SimTradeLog[];
}

const SIM_STARTING_BALANCE = 50_000;
const SIM_MAX_LOSS = 2_000;
const SIM_MLL_FLOOR = SIM_STARTING_BALANCE - SIM_MAX_LOSS;
const SIM_POINT_VALUE = 5;
const SIM_QTY_PRESETS = [1, 3, 5, 10, 15] as const;

type SimInstrumentId = 'NQ' | 'MNQ';
const SIM_INSTRUMENTS: Record<SimInstrumentId, FuturesContractSpec> = { NQ: NQ_SPEC, MNQ: MNQ_SPEC };
const SIM_INSTRUMENT_IDS: SimInstrumentId[] = ['NQ', 'MNQ'];
const SIM_VISIBLE_CANDLES = 44;

// Each timeframe paces its own tick loop (tickMs/ticksPerCandle) AND scales
// candle range (volatilityMultiplier) independently of the simulated
// time-axis step (candleDurationMs) — switching tabs is immediately, audibly
// a different playback speed, not just a relabel of the same-sized candles.
const SIM_TIMEFRAME_CONFIG: Record<SimTimeframe, { tickMs: number; ticksPerCandle: number; candleDurationMs: number; volatilityMultiplier: number }> = {
  '1m': { tickMs: 220, ticksPerCandle: 6, candleDurationMs: 60_000, volatilityMultiplier: 1 },
  '5m': { tickMs: 260, ticksPerCandle: 7, candleDurationMs: 5 * 60_000, volatilityMultiplier: 1.62 },
  '15m': { tickMs: 320, ticksPerCandle: 8, candleDurationMs: 15 * 60_000, volatilityMultiplier: 2.25 },
  '30m': { tickMs: 420, ticksPerCandle: 9, candleDurationMs: 30 * 60_000, volatilityMultiplier: 2.77 },
  '1h': { tickMs: 600, ticksPerCandle: 10, candleDurationMs: 60 * 60_000, volatilityMultiplier: 3.41 },
};

function gaussianNoise(): number {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function volatilityForPrice(price: number): number { return Math.max(0.15, price * 0.0007); }
function randomSimStartPrice(): number { return Math.round((80 + Math.random() * 4800) * 100) / 100; }

function seedSimCandles(count: number, startPrice: number, volatility: number, now: number, stepMs: number): SimCandle[] {
  const candles: SimCandle[] = [];
  let price = Math.max(0.5, startPrice - gaussianNoise() * volatility * 6);
  const startTime = now - stepMs * count;
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = gaussianNoise() * volatility;
    const close = Math.max(0.5, open + drift);
    const high = Math.max(open, close) + Math.abs(gaussianNoise()) * volatility * 0.6;
    const low = Math.max(0.25, Math.min(open, close) - Math.abs(gaussianNoise()) * volatility * 0.6);
    candles.push({ time: startTime + i * stepMs, open, high, low, close });
    price = close;
  }
  return candles;
}
function openSimCandle(prevClose: number, time: number): SimCandle { return { time, open: prevClose, high: prevClose, low: prevClose, close: prevClose }; }
function tickSimCandle(candle: SimCandle, volatility: number): SimCandle {
  const step = gaussianNoise() * volatility;
  const close = Math.max(0.5, candle.close + step);
  return { ...candle, close, high: Math.max(candle.high, close), low: Math.min(candle.low, close) };
}

function blankSimAccount(startingBalance: number = SIM_STARTING_BALANCE): SimAccountState {
  return { startingBalance, realizedPnl: 0, position: null, trades: [] };
}
function simBalance(account: SimAccountState): number { return account.startingBalance + account.realizedPnl; }
function simUnrealizedPnl(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): number {
  if (!account.position) return 0;
  const diff = price - account.position.avgPrice;
  const signed = account.position.side === 'long' ? diff : -diff;
  return signed * account.position.qty * pointValue;
}
function simEquity(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): number {
  return simBalance(account) + simUnrealizedPnl(account, price, pointValue);
}
function isSimBreached(account: SimAccountState, price: number, pointValue: number = SIM_POINT_VALUE): boolean {
  return simEquity(account, price, pointValue) <= SIM_MLL_FLOOR;
}
function placeSimMarketOrder(account: SimAccountState, side: SimSide, qty: number, price: number, time: number, pointValue: number = SIM_POINT_VALUE): SimAccountState {
  if (qty <= 0) return account;
  const pos = account.position;
  if (!pos) {
    return { ...account, position: { side, qty, avgPrice: price }, trades: [...account.trades, { side, qty, price, pnl: 0, time }] };
  }
  if (pos.side === side) {
    const newQty = pos.qty + qty;
    const avgPrice = (pos.avgPrice * pos.qty + price * qty) / newQty;
    return { ...account, position: { side, qty: newQty, avgPrice }, trades: [...account.trades, { side, qty, price, pnl: 0, time }] };
  }
  const closingQty = Math.min(qty, pos.qty);
  const diff = price - pos.avgPrice;
  const signed = pos.side === 'long' ? diff : -diff;
  const realized = signed * closingQty * pointValue;
  const remainderQty = qty - closingQty;
  const leftoverPosQty = pos.qty - closingQty;
  const nextPosition: SimPosition | null = remainderQty > 0
    ? { side, qty: remainderQty, avgPrice: price }
    : leftoverPosQty > 0
      ? { side: pos.side, qty: leftoverPosQty, avgPrice: pos.avgPrice }
      : null;
  return {
    ...account,
    realizedPnl: account.realizedPnl + realized,
    position: nextPosition,
    trades: [...account.trades, { side: nextPosition ? side : 'flat', qty, price, pnl: realized, time }],
  };
}
function closeSimPosition(account: SimAccountState, price: number, time: number, pointValue: number = SIM_POINT_VALUE): SimAccountState {
  const pos = account.position;
  if (!pos) return account;
  const diff = price - pos.avgPrice;
  const signed = pos.side === 'long' ? diff : -diff;
  const realized = signed * pos.qty * pointValue;
  return { ...account, realizedPnl: account.realizedPnl + realized, position: null, trades: [...account.trades, { side: 'flat', qty: pos.qty, price, pnl: realized, time }] };
}
function setSimBracket(account: SimAccountState, takeProfit: number | null, stopLoss: number | null): SimAccountState {
  if (!account.position) return account;
  return { ...account, position: { ...account.position, takeProfit, stopLoss } };
}
function checkSimBracketHit(position: SimPosition, candle: SimCandle): { kind: 'takeProfit' | 'stopLoss'; price: number } | null {
  const { side, takeProfit, stopLoss } = position;
  if (side === 'long') {
    if (stopLoss != null && candle.low <= stopLoss) return { kind: 'stopLoss', price: stopLoss };
    if (takeProfit != null && candle.high >= takeProfit) return { kind: 'takeProfit', price: takeProfit };
  } else {
    if (stopLoss != null && candle.high >= stopLoss) return { kind: 'stopLoss', price: stopLoss };
    if (takeProfit != null && candle.low <= takeProfit) return { kind: 'takeProfit', price: takeProfit };
  }
  return null;
}

function computeSMA(candles: SimCandle[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
function computeRSI(candles: SimCandle[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let avgGain = 0; let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) avgGain += change; else avgLoss -= change;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
function computeSessionVwap(candles: SimCandle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
    sum += typical;
    out.push(sum / (i + 1));
  }
  return out;
}

interface MockFuturesTicker { symbol: string; name: string }
const MOCK_FUTURES_TICKERS: MockFuturesTicker[] = [
  { symbol: 'ES', name: 'S&P 500 futures' },
  { symbol: 'NQ', name: 'Nasdaq 100 futures' },
  { symbol: 'YM', name: 'Dow futures' },
  { symbol: 'RTY', name: 'Russell 2000 futures' },
  { symbol: 'CL', name: 'Crude oil futures' },
  { symbol: 'GC', name: 'Gold futures' },
  { symbol: 'SI', name: 'Silver futures' },
  { symbol: 'NG', name: 'Natural gas futures' },
  { symbol: 'ZB', name: '30-year bond futures' },
  { symbol: '6E', name: 'Euro FX futures' },
];
const simMoney = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

// ── Learning: news event simulator ────────────────────────────────────────────────
interface NewsEventKind { id: string; label: string; short: string; typicalTime: string }
const NEWS_EVENT_KINDS: NewsEventKind[] = [
  { id: 'cpi', label: 'CPI — Consumer Price Index', short: 'CPI', typicalTime: '8:30 AM ET, monthly' },
  { id: 'ppi', label: 'PPI — Producer Price Index', short: 'PPI', typicalTime: '8:30 AM ET, monthly' },
  { id: 'nfp', label: 'NFP — Non-Farm Payrolls', short: 'NFP', typicalTime: '8:30 AM ET, first Friday' },
  { id: 'fomc', label: 'FOMC Rate Decision', short: 'FOMC', typicalTime: '2:00 PM ET, ~8x/year' },
];

// Deterministic-shape, randomly-scaled price path: calm pre-release chop, a sharp
// whipsaw against the eventual trend right at the release, then a real trend leg.
function buildNewsPriceSeries(direction: 1 | -1) {
  const pre: number[] = [100];
  for (let i = 1; i < 9; i++) pre.push(pre[i - 1] + (Math.random() - 0.5) * 0.3);
  const preEnd = pre[pre.length - 1];
  const fakeoutExtreme = preEnd - direction * (1.5 + Math.random() * 0.7);
  const spike = [
    preEnd,
    preEnd - direction * (0.8 + Math.random() * 0.3),
    fakeoutExtreme,
    fakeoutExtreme + direction * (0.9 + Math.random() * 0.3),
    preEnd + direction * (0.3 + Math.random() * 0.3),
    preEnd + direction * (0.7 + Math.random() * 0.2),
  ];
  const trendStart = spike[spike.length - 1];
  const trend: number[] = [trendStart];
  for (let i = 1; i < 9; i++) trend.push(trend[i - 1] + direction * (0.22 + Math.random() * 0.22));
  return { pre, spike, trend, fakeoutExtreme, trendStart, trendEnd: trend[trend.length - 1], releaseChasePrice: spike[0] };
}

function NewsSimChart({ pre, spike, trend, revealSpike, revealTrend }: { pre: number[]; spike: number[]; trend: number[]; revealSpike: boolean; revealTrend: boolean }) {
  const all = [...pre, ...spike, ...trend];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.15 || 1;
  const w = 640; const h = 180;
  const toX = (i: number) => (i / (all.length - 1)) * w;
  const toY = (v: number) => h - ((v - (min - pad)) / (max - min + pad * 2)) * h;
  const toPoints = (start: number, arr: number[]) => arr.map((v, i) => `${toX(start + i)},${toY(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="news-sim-chart" preserveAspectRatio="none">
      <line x1={toX(pre.length - 1)} y1={0} x2={toX(pre.length - 1)} y2={h} stroke="var(--border)" strokeDasharray="4 4" strokeWidth={1.5} />
      <polyline points={toPoints(0, pre)} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} />
      {revealSpike && <polyline points={toPoints(pre.length - 1, [pre[pre.length - 1], ...spike])} fill="none" stroke="#FB7185" strokeWidth={2} />}
      {revealTrend && <polyline points={toPoints(pre.length + spike.length - 1, [spike[spike.length - 1], ...trend])} fill="none" stroke="#7AE2AA" strokeWidth={2.5} />}
    </svg>
  );
}

function NewsEventSimulator(): React.ReactNode {
  const [eventId, setEventId] = useState<string>('cpi');
  const [stage, setStage] = useState<'setup' | 'pre' | 'spike' | 'result'>('setup');
  const [series, setSeries] = useState(() => buildNewsPriceSeries(1));
  const [choice, setChoice] = useState<'during' | 'wait' | null>(null);

  const event = NEWS_EVENT_KINDS.find((e) => e.id === eventId) ?? NEWS_EVENT_KINDS[0];

  const runSimulation = () => {
    const dir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
    setSeries(buildNewsPriceSeries(dir));
    setChoice(null);
    setStage('pre');
  };

  const reveal = () => setStage('spike');
  const pick = (c: 'during' | 'wait') => { setChoice(c); setStage('result'); };

  const lossDuring = Math.abs(series.releaseChasePrice - series.fakeoutExtreme);
  const gainWaiting = Math.abs(series.trendEnd - series.trendStart);

  return (
    <div className="news-sim">
      <div className="news-sim-controls">
        {NEWS_EVENT_KINDS.map((e) => (
          <button
            key={e.id}
            className={`filter-chip ${eventId === e.id ? 'selected' : ''}`}
            onClick={() => setEventId(e.id)}
            disabled={stage !== 'setup'}
            data-testid={`button-news-event-${e.id}`}
          >
            {e.short}
          </button>
        ))}
      </div>
      <p className="muted tiny news-sim-time">{event.label} typically drops {event.typicalTime}.</p>

      {stage === 'setup' && (
        <button className="button button-primary" onClick={runSimulation} data-testid="button-run-news-sim">Run the simulation</button>
      )}

      {stage !== 'setup' && (
        <>
          <div className="news-sim-chart-wrap">
            <NewsSimChart pre={series.pre} spike={series.spike} trend={series.trend} revealSpike={stage !== 'pre'} revealTrend={stage === 'result'} />
          </div>
          <div className="news-sim-legend">
            <span><i className="news-sim-dot news-sim-dot--pre" /> Before release</span>
            <span><i className="news-sim-dot news-sim-dot--spike" /> The release hits</span>
            <span><i className="news-sim-dot news-sim-dot--trend" /> Real trend, after it settles</span>
          </div>
        </>
      )}

      {stage === 'pre' && (
        <>
          <p>{event.short} is about to print. Price has been quiet all morning — that is normal right before a scheduled release.</p>
          <button className="button button-outline" onClick={reveal} data-testid="button-reveal-news-release">The number just printed — see the reaction</button>
        </>
      )}

      {stage === 'spike' && (
        <>
          <p>The first move is violent and two-sided — this is exactly the moment it is tempting to jump in and chase it.</p>
          <div className="news-sim-choice-row">
            <button className="button button-primary" onClick={() => pick('during')} data-testid="button-news-choice-during">Chase the spike right now</button>
            <button className="button button-outline" onClick={() => pick('wait')} data-testid="button-news-choice-wait">Wait for the trend to confirm</button>
          </div>
        </>
      )}

      {stage === 'result' && (
        <>
          <div className="news-sim-outcomes">
            <div className={`news-sim-outcome-card ${choice === 'during' ? 'news-sim-outcome-card--picked' : ''}`}>
              <span className="eyebrow">If you chased the spike</span>
              <p className="news-sim-outcome-value news-sim-outcome-value--loss">−{lossDuring.toFixed(2)} pts</p>
              <p>Entering right at the release means a real stop-loss usually gets run during the whipsaw — before the actual trend even starts.</p>
            </div>
            <div className={`news-sim-outcome-card ${choice === 'wait' ? 'news-sim-outcome-card--picked' : ''}`}>
              <span className="eyebrow">If you waited for confirmation</span>
              <p className="news-sim-outcome-value news-sim-outcome-value--gain">+{gainWaiting.toFixed(2)} pts</p>
              <p>Letting the initial whipsaw resolve and entering once the trend is confirmed captures the real move with far less noise.</p>
            </div>
          </div>
          <Callout label={choice === 'wait' ? 'Exactly right' : 'Worth remembering'}>
            {choice === 'wait'
              ? "That patience is the whole lesson — the trend after a release is usually cleaner and safer than the release itself."
              : "It felt like the fast move, but the release itself is usually the riskiest few minutes of the day. The trend that follows is where the real, tradeable edge is."}
          </Callout>
          <button className="button button-outline" onClick={runSimulation} data-testid="button-news-sim-again">Run another scenario</button>
        </>
      )}
    </div>
  );
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

function bodyEconomicCalendar(): React.ReactNode {
  return (
    <>
      <p>Not every trading day is equal. A handful of days each month, a scheduled economic report can move every market at once — regardless of what your chart's technicals say.</p>
      <div className="definition-grid">
        <DefinitionCard title="CPI — Consumer Price Index">The primary read on inflation. Measures the change in prices consumers pay for a basket of goods and services, released monthly. A hotter-than-expected print often pressures risk assets as traders price in tighter policy.</DefinitionCard>
        <DefinitionCard title="PPI — Producer Price Index">Measures the change in prices producers receive for their output. It is a leading indicator for CPI — rising producer costs tend to get passed down to consumers a little later.</DefinitionCard>
        <DefinitionCard title="NFP — Non-Farm Payrolls">Released the first Friday of most months, NFP measures the change in employed persons excluding farm, government, private household, and nonprofit workers. It is one of the single biggest volatility events on the calendar.</DefinitionCard>
        <DefinitionCard title="FOMC — Rate Decision">The Federal Open Market Committee meets roughly eight times a year to set the federal funds rate. The rate decision, the statement, and the press conference that follows can each move price independently of each other.</DefinitionCard>
      </div>
      <LessonHeading>Why these days trade differently</LessonHeading>
      <p>Right before a scheduled release, liquidity often thins out as market makers widen spreads and pull resting orders. The instant the number prints, that liquidity floods back in all at once — producing sharp, two-sided moves that can reverse direction two or three times before a real trend takes hold.</p>
      <Callout label="Check the calendar first">
        Before you plan a trade, know whether CPI, PPI, NFP, FOMC, or another high-impact release lands during your session. Free economic calendars list release times and consensus estimates well in advance — there is no excuse for being surprised by one.
      </Callout>
      <LessonHeading>The reaction matters more than the headline</LessonHeading>
      <p>What matters is not just whether the actual number beat or missed consensus — it is how price actually reacts afterward. A "beat" can still sell off hard if the market had already priced in something even stronger.</p>
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

function bodyTradingAroundNews(): React.ReactNode {
  return (
    <>
      <p>Every trader eventually feels the pull to jump on the first big candle after CPI, PPI, NFP, or an FOMC decision prints. It is also one of the fastest ways to give back a week of gains in a single trade.</p>
      <LessonHeading>What actually happens in the first few minutes</LessonHeading>
      <ul className="lesson-list">
        <li>Spreads widen sharply, and slippage on entries and stops gets much worse</li>
        <li>Price frequently whipsaws in both directions before settling on a real trend</li>
        <li>Stop-losses on both sides of the market get run during that whipsaw</li>
        <li>Many brokers and prop firms restrict or flag trading around high-impact releases entirely</li>
      </ul>
      <Callout label="The desk's rule">
        Let the release fully play out and let the first move actually hold before you consider a trade. Chasing the initial candle means trading blind into the most chaotic few minutes of the entire session.
      </Callout>
      <LessonHeading>What to watch for instead</LessonHeading>
      <ul className="lesson-list">
        <li>Let the initial spike and whipsaw complete — often the first 5 to 15 minutes</li>
        <li>Look for a clean break of structure in one direction, confirmed by a candle close</li>
        <li>Wait for a retest or pullback that holds before entering in the direction of the now-established trend</li>
        <li>Size and manage the trade with your normal risk framework — a news day is not a reason to abandon it</li>
      </ul>
      <LessonHeading>Practice the discipline</LessonHeading>
      <p>The simulator below plays out a simplified CPI/PPI/NFP/FOMC-style release: a calm pre-release chop, a sharp two-sided whipsaw right at the print, then the real trend. Run it a few times and compare what happens if you chase the spike versus wait for the trend to confirm.</p>
      <NewsEventSimulator />
      <p className="muted tiny">This is a simplified simulation for practice, not a forecast of real markets. Get in the habit of checking the economic calendar every day and staying cautious of open positions when a high-impact release is on the schedule.</p>
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

// A small inline diagram — one NQ contract vs. one MNQ contract, and the four
// forex lot sizes, drawn to relative scale. Follows the same plain-svg,
// hardcoded-hex-accent convention as CandleGlyph/NewsSimChart above.
function ContractLeverageCompare() {
  const w = 320; const h = 150; const baseline = 130;
  const nqTop = 30; const mnqTop = 120;
  const lots = FOREX_LOTS;
  const lotColors = ['#7AE2AA', '#60A5FA', '#E2C25A', '#FDBA74'];
  const lotX = [176, 208, 240, 272];
  const lotTop = lots.map((l) => baseline - (10 + ((Math.log10(l.units) - 2) / 3) * 90));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block', margin: '0 auto' }}>
      <text x={4} y={12} fontSize={8} fontWeight={700} fill="var(--muted-foreground)">FUTURES · 1 CONTRACT EACH</text>
      <line x1={0} y1={baseline} x2={150} y2={baseline} stroke="var(--border)" strokeWidth={1.2} />
      <rect x={22} y={nqTop} width={30} height={baseline - nqTop} fill="#60A5FA" rx={2} />
      <text x={37} y={nqTop - 6} fontSize={9} fontWeight={700} textAnchor="middle" fill="#60A5FA">$20/pt</text>
      <text x={37} y={143} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">NQ</text>
      <rect x={78} y={mnqTop} width={30} height={baseline - mnqTop} fill="#E2C25A" rx={2} />
      <text x={93} y={mnqTop - 6} fontSize={9} fontWeight={700} textAnchor="middle" fill="#E2C25A">$2/pt</text>
      <text x={93} y={143} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">MNQ</text>
      <line x1={162} y1={10} x2={162} y2={140} stroke="var(--border)" strokeWidth={1} />
      <text x={170} y={12} fontSize={8} fontWeight={700} fill="var(--muted-foreground)">FOREX · LOT SIZE</text>
      <line x1={170} y1={baseline} x2={316} y2={baseline} stroke="var(--border)" strokeWidth={1.2} />
      {lots.map((lot, i) => (
        <g key={lot.id}>
          <rect x={lotX[i]} y={lotTop[i]} width={18} height={baseline - lotTop[i]} fill={lotColors[i]} rx={2} />
          <text x={lotX[i] + 9} y={lotTop[i] - 5} fontSize={8} textAnchor="middle" fill="var(--muted-foreground)">${lot.pipValue.toFixed(2)}</text>
          <text x={lotX[i] + 9} y={143} fontSize={8} textAnchor="middle" fill="var(--muted-foreground)">{lot.label.split(' ')[0].slice(0, 5).toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}

function bodyContractSizingLeverage(): React.ReactNode {
  return (
    <>
      <p>Before position sizing means anything, you need to know what one unit of what you are trading is actually worth. A <strong>contract</strong> (futures) and a <strong>lot</strong> (forex) both answer that question — and picking the wrong size is one of the fastest ways to blow past a drawdown floor without meaning to.</p>
      <LessonHeading>Futures: one contract, a fixed multiplier</LessonHeading>
      <p>A futures contract's dollar value per point of movement — its <strong>multiplier</strong> — is fixed by the exchange (CME), not your broker. It never changes no matter which platform you trade it on.</p>
      <div className="definition-grid">
        <DefinitionCard title={`${NQ_SPEC.symbol} — ${NQ_SPEC.name}`}>${NQ_SPEC.pointValue} per index point, in ticks of {NQ_SPEC.tickSize} points worth ${NQ_SPEC.tickValue} each. The "full-size" Nasdaq-100 contract.</DefinitionCard>
        <DefinitionCard title={`${MNQ_SPEC.symbol} — ${MNQ_SPEC.name}`}>${MNQ_SPEC.pointValue} per index point — exactly 1/10th of NQ. Same index, same {MNQ_SPEC.tickSize}-point tick size, same everything else — only the dollar multiplier is scaled down.</DefinitionCard>
      </div>
      <Callout label="The cost difference, in one number">
        A 10-point move on the Nasdaq-100 is ${10 * NQ_SPEC.pointValue} of P&amp;L on one NQ contract — and just ${10 * MNQ_SPEC.pointValue} on one MNQ contract. Same market, same 10-point move, 10x the dollar swing. That is the entire reason MNQ exists: to let a trader size a position in the same market with a much smaller dollar step per contract.
      </Callout>
      <div className="lesson-diagram"><ContractLeverageCompare /></div>
      <LessonHeading>Forex: lot size instead of contract count</LessonHeading>
      <p>Forex has no exchange-fixed contract — instead, brokers quote a trade in <strong>units</strong> of the base currency, grouped into standard lot sizes. The bigger the lot, the more each pip of movement is worth.</p>
      <div className="definition-grid">
        {FOREX_LOTS.map((lot) => (
          <DefinitionCard key={lot.id} title={`${lot.label} — ${lot.units.toLocaleString()} units`}>
            Roughly ${lot.pipValue.toFixed(2)} per pip on a USD-quoted pair like EUR/USD. {lot.id === 'standard' ? 'The full-size lot institutional-style accounts are often quoted in.' : lot.id === 'nano' ? 'The smallest step most retail brokers offer — built for practicing with real (if tiny) money on the line.' : 'A common size for retail accounts learning to size positions deliberately.'}
          </DefinitionCard>
        ))}
      </div>
      <LessonHeading>Leverage — what it actually means</LessonHeading>
      <Callout label="The formula">
        Leverage = (notional value you control) ÷ (capital required to control it). It is a ratio, not a dollar amount — it tells you how much market exposure one dollar of your own capital is controlling.
      </Callout>
      <p>Worked example, using a hypothetical Nasdaq-100 level of 20,000 (not a live quote): one NQ contract would control 20,000 × ${NQ_SPEC.pointValue} = ${(20000 * NQ_SPEC.pointValue).toLocaleString()} of notional exposure. One MNQ contract controls 20,000 × ${MNQ_SPEC.pointValue} = ${(20000 * MNQ_SPEC.pointValue).toLocaleString()} — exactly 1/10th, matching the 1/10th margin a broker would typically require for it.</p>
      <p className="muted tiny">Because both the notional exposure and the required margin scale by the same 10x between NQ and MNQ, the leverage ratio itself is identical on both — roughly 20-to-1 in this example, whichever one you pick. Contract size changes your dollar risk per point; it does not, by itself, change how leveraged you are.</p>
      <p>Forex leverage works the same way but the ratio offered varies far more — commonly capped around 30-to-1 to 50-to-1 for major pairs at regulated U.S./E.U./U.K. brokers, and often much higher at offshore brokers. Higher available leverage is not a recommendation to use all of it — it only changes how little of your own capital a large position requires, not how much risk that position carries.</p>
      <LessonHeading>See it live</LessonHeading>
      <p>The Live Trading Simulator lets you flip between an NQ-sized and MNQ-sized position on the exact same chart and watch the balance/P&amp;L numbers move at 10x different speeds for the same price action — the fastest way to make this concept feel real instead of theoretical.</p>
      <Callout label="Sizing an MNQ habit onto NQ">
        A trader spends weeks building a comfortable, well-sized habit trading 5 MNQ contracts per trade with a $2,000 max drawdown in mind. They switch to NQ for "better fills" and keep the same "5 contracts" habit out of muscle memory — instantly trading a position 10x their intended dollar risk. A normal, expected pullback that would have cost $150 on 5 MNQ costs $1,500 on 5 NQ, most of an entire drawdown cushion in one trade. Position size in "number of contracts" is meaningless on its own — it only means something next to that contract's dollar multiplier.
      </Callout>
    </>
  );
}

// ── Learning: module registry ──────────────────────────────────────────────────────
const LEARNING_MODULES: LearningModule[] = [
  { id: 'welcome', level: 'Beginner', kind: 'lesson', title: 'Welcome to WickBetts', tagline: 'What this academy is, and the one trait that matters more than any indicator.', minutes: 4, xp: 40, icon: GraduationCap, body: bodyWelcome, videos: [
    { title: 'Stock Market Explained in 4 Minutes | The Simplest Explanation', url: 'https://www.youtube.com/watch?v=effipLTUUl4', duration: '4:08' },
  ] },
  { id: 'markets-101', level: 'Beginner', kind: 'lesson', title: 'The Four Markets', tagline: 'Indices, futures, stocks, and crypto — what each one actually is.', minutes: 7, xp: 50, icon: Layers, body: bodyMarkets101, videos: [
    { title: 'Crypto Explained in Just 5 Minutes!', url: 'https://www.youtube.com/watch?v=hTYwTPmROrM', duration: '4:32' },
    { title: 'Futures Trading Explained For Beginners in 5 Minutes', url: 'https://www.youtube.com/watch?v=Dh5KFZqEHqU', duration: '5:59' },
  ] },
  { id: 'demo-to-live', level: 'Beginner', kind: 'lesson', title: 'From Demo to Live', tagline: "Where to practice, how much to risk first, and the checkpoint that tells you you're ready.", minutes: 5, xp: 40, icon: Rocket, body: bodyDemoToLive, videos: [
    { title: 'How to Paper Trade / Simulate Trades in TradingView (2026 Guide)', url: 'https://www.youtube.com/watch?v=1EnfqWoxuAY', duration: '3:35' },
  ] },
  { id: 'reading-the-chart', level: 'Intermediate', kind: 'lesson', title: 'Reading the Chart', tagline: 'Trend, volume, timeframes, support & resistance — before every trade.', minutes: 8, xp: 60, icon: TrendingUp, body: bodyReadingTheChart, videos: [
    { title: 'Support/Resistance Explained in 60 Seconds', url: 'https://www.youtube.com/watch?v=YbWHkFX58L4', duration: '1:01' },
    { title: 'What is Support and Resistance in Trading?', url: 'https://www.youtube.com/watch?v=Wwxb3DROwrc', duration: '3:04' },
  ] },
  { id: 'candlestick-encyclopedia', level: 'Intermediate', kind: 'lesson', title: 'The Candlestick Encyclopedia', tagline: 'Every candle tells a story — learn to read all of them.', minutes: 12, xp: 80, icon: CandlestickChart, body: bodyCandlestickEncyclopedia, videos: [
    { title: 'Candlestick Patterns Explained: Top 5 Patterns For Beginners', url: 'https://www.youtube.com/watch?v=qunnM_aQWQk', duration: '9:21' },
  ] },
  { id: 'candle-arcade', level: 'Intermediate', kind: 'game', title: 'Candle ID Arcade', tagline: 'Speed-round: name the pattern before the streak breaks.', minutes: 5, xp: 0, icon: Gamepad2 },
  { id: 'economic-calendar-101', level: 'Intermediate', kind: 'lesson', title: 'Economic Data & the Calendar', tagline: 'CPI, PPI, NFP, and FOMC — the releases that move every market at once.', minutes: 7, xp: 60, icon: CalendarDays, body: bodyEconomicCalendar },
  { id: 'indicators-toolkit', level: 'Advanced', kind: 'lesson', title: 'Indicators 101: SMA & Friends', tagline: 'The Simple Moving Average — the math, the meaning, and the crossover signals.', minutes: 9, xp: 70, icon: Percent, body: bodyIndicatorsToolkit, videos: [
    { title: 'What Is The Simple Moving Average? (SMA) & How To Use It!', url: 'https://www.youtube.com/watch?v=TRy9InVeFc8', duration: '4:03' },
    { title: 'How to Use the Relative Strength Index (RSI)', url: 'https://www.youtube.com/watch?v=hbcCykbX14U', duration: '4:22' },
  ] },
  { id: 'contract-sizing-leverage', level: 'Advanced', kind: 'lesson', title: 'Contracts, Lot Sizes & Leverage', tagline: 'NQ vs MNQ, forex lot sizes, and what leverage actually means — with a live cost comparison in the simulator.', minutes: 9, xp: 70, icon: GitCompare, body: bodyContractSizingLeverage },
  { id: 'trading-simulator', level: 'Advanced', kind: 'game', title: 'Live Trading Simulator', tagline: 'A live-ticking candlestick chart, real bracket orders, and NQ vs MNQ sizing — all practice money.', minutes: 10, xp: 0, icon: Activity },
  { id: 'risk-and-psychology', level: 'Advanced', kind: 'lesson', title: "Risk & the Trader's Mindset", tagline: 'Position sizing, stops, and the patience that keeps an edge alive.', minutes: 8, xp: 60, icon: ShieldCheck, body: bodyRiskAndPsychology, videos: [
    { title: 'The Risk to Reward Ratio Explained in One Minute', url: 'https://www.youtube.com/watch?v=aKZsireNBIM', duration: '1:36' },
  ] },
  { id: 'liquidity-and-structure', level: 'Advanced', kind: 'lesson', title: 'Liquidity & Market Structure', tagline: 'Why price hunts obvious stops, and how to read structure like the desk does.', minutes: 7, xp: 60, icon: Target, body: bodyLiquidityAndStructure, videos: [
    { title: 'Liquidity Zones SIMPLIFIED', url: 'https://www.youtube.com/watch?v=0BOMeGq-J0I', duration: '8:38' },
    { title: 'High and Low Liquidity Zones in Trading Explained (Supply & Demand Basics)', url: 'https://www.youtube.com/watch?v=kAmPmTPJpg8', duration: '6:46' },
  ] },
  { id: 'trading-around-news', level: 'Advanced', kind: 'lesson', title: 'Trading Around News Events', tagline: 'Why the first move after a release is usually the wrong one — and what to watch instead.', minutes: 9, xp: 70, icon: Newspaper, body: bodyTradingAroundNews },
  { id: 'trading-through-history', level: 'Expert', kind: 'lesson', title: 'A Short History of Trading', tagline: 'From Amsterdam warehouses to algorithms — how markets got here.', minutes: 8, xp: 70, icon: BookMarked, body: bodyTradingThroughHistory, videos: [
    { title: 'The Hidden History Behind the New York Stock Exchange', url: 'https://www.youtube.com/shorts/2_KM19rvW94', duration: '1:35' },
  ] },
  { id: 'trailblazers', level: 'Expert', kind: 'lesson', title: 'Trailblazers: Great Black Traders & Investors', tagline: "The people who broke into rooms that weren't built for them.", minutes: 10, xp: 80, icon: Crown, body: bodyTrailblazers, videos: [
    { title: 'The Story Behind The Pursuit of Happyness: 20 Years Later with Chris Gardner', url: 'https://www.youtube.com/watch?v=oRvZjh8QK2g', duration: '7:00' },
  ] },
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
  const [celebration, setCelebration] = useState<LearningLevel | null>(null);

  useEffect(() => { setProgress(loadLearningProgress(userId)); }, [userId]);
  useEffect(() => { saveLearningProgress(userId, progress); }, [userId, progress]);

  // Reward system — congratulate the member the moment every module in a track
  // (lessons AND arcade games both count) is complete, and pay out a one-time bonus.
  useEffect(() => {
    const newlyDone = LEARNING_LEVELS.filter((lvl) => {
      if (progress.completedTracks.includes(lvl)) return false;
      const inLevel = LEARNING_MODULES.filter((m) => m.level === lvl);
      return inLevel.length > 0 && inLevel.every((m) => progress.completedModules.includes(m.id));
    });
    if (newlyDone.length === 0) return;
    setProgress((prev) => ({
      ...prev,
      completedTracks: [...prev.completedTracks, ...newlyDone],
      xp: prev.xp + newlyDone.length * TRACK_BONUS_XP,
    }));
    setCelebration(newlyDone[newlyDone.length - 1]);
  }, [progress.completedModules, progress.completedTracks]);

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

      {celebration && (
        <div className="surface-dark track-celebration animate-in" data-testid="banner-track-celebration">
          <Trophy size={20} />
          <div>
            <h3>{celebration} track complete!</h3>
            <p>Nice work — you cleared every module in the {celebration} path, lessons and arcade games alike. +{TRACK_BONUS_XP} bonus XP.</p>
          </div>
          <button className="icon-button" onClick={() => setCelebration(null)} data-testid="button-dismiss-celebration"><X size={14} /></button>
        </div>
      )}

      {view === 'overview' ? (
        <>
          <div className="filter-bar" style={{ marginTop: 28 }}>
            {LEARNING_LEVELS.map((lvl) => {
              const { done, total } = levelCompletion(lvl);
              const trackDone = done === total && total > 0;
              return (
                <button
                  key={lvl}
                  className={`filter-chip ${activeLevel === lvl ? 'selected' : ''}`}
                  onClick={() => setActiveLevel(lvl)}
                  data-testid={`filter-learning-level-${lvl.toLowerCase()}`}
                >
                  {trackDone && <Trophy size={10} />} {lvl} <span className="tiny" style={{ opacity: 0.7 }}>· {done}/{total}</span>
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
                      ? <span>{mod.id === 'candle-arcade'
                          ? `Best score: ${progress.candleGame.bestScore}`
                          : mod.id === 'trivia-arena'
                          ? `Best score: ${progress.triviaGame.bestScore}`
                          : `Best equity: ${simMoney(progress.liveSimGame.bestEquity)}`}</span>
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
            : activeModule.id === 'trivia-arena'
            ? <TriviaArenaGame progress={progress} setProgress={setProgress} />
            : <TradingSimulatorGame progress={progress} setProgress={setProgress} onOpenLesson={openModule} />}
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
      {module.videos && module.videos.length > 0 && (
        <div className="video-suggestions">
          <span className="eyebrow">Watch instead (optional, under 10 min)</span>
          <div className="video-suggestions-row">
            {module.videos.map((v) => (
              <a key={v.url} href={v.url} target="_blank" rel="noopener noreferrer" className="video-chip" data-testid={`link-video-${v.url.split('v=').pop() ?? v.url}`}>
                <PlayCircle size={13} />
                <span>{v.title}</span>
                <span className="video-chip-duration">{v.duration}</span>
              </a>
            ))}
          </div>
        </div>
      )}
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
      completedModules: prev.completedModules.includes('candle-arcade') ? prev.completedModules : [...prev.completedModules, 'candle-arcade'],
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
      completedModules: prev.completedModules.includes('trivia-arena') ? prev.completedModules : [...prev.completedModules, 'trivia-arena'],
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

// ── Learning: live candlestick chart (TradingView-style) ─────────────────────────
interface CandleIndicatorSeries { sma?: (number | null)[]; ema?: (number | null)[]; vwap?: (number | null)[] }
const RSI_PANEL_HEIGHT = 56;
const RSI_PANEL_GAP = 10;

/**
 * Live-scrolling candlestick chart for the Live Trading Simulator — a
 * recessed dark plot panel, a faint ticker watermark, gridlines, a
 * TradingView-style OHLC readout, optional MA/VWAP overlays, an optional
 * take-profit/stop-loss bracket, and an optional RSI sub-panel. Plain inline
 * SVG, no charting library — `width`/`height` are fully caller-controlled so
 * the panel can be interactively resized (see the drag handle in
 * TradingSimulatorGame below).
 */
function LiveCandleChart({
  candles, width, height = 260, entryPrice, entrySide, takeProfitPrice, stopLossPrice, indicators, rsi, symbol,
}: {
  candles: SimCandle[]; width: number; height?: number;
  entryPrice?: number | null; entrySide?: SimSide | null;
  takeProfitPrice?: number | null; stopLossPrice?: number | null;
  indicators?: CandleIndicatorSeries; rsi?: (number | null)[]; symbol?: string;
}) {
  const axisGutter = 58;
  const bottomGutter = 20;
  const topPad = 12;
  const showRsi = !!rsi && rsi.some((v) => v != null);
  const plotW = Math.max(0, width - axisGutter);
  const plotH = Math.max(0, height - bottomGutter - topPad);

  const layout = useMemo(() => {
    if (candles.length === 0 || plotW <= 0 || plotH <= 0) return null;
    let min = Infinity; let max = -Infinity;
    for (const c of candles) { if (c.low < min) min = c.low; if (c.high > max) max = c.high; }
    if (entryPrice != null) { min = Math.min(min, entryPrice); max = Math.max(max, entryPrice); }
    if (takeProfitPrice != null) { min = Math.min(min, takeProfitPrice); max = Math.max(max, takeProfitPrice); }
    if (stopLossPrice != null) { min = Math.min(min, stopLossPrice); max = Math.max(max, stopLossPrice); }
    for (const series of [indicators?.sma, indicators?.ema, indicators?.vwap]) {
      if (!series) continue;
      for (const v of series) { if (v == null) continue; if (v < min) min = v; if (v > max) max = v; }
    }
    if (min === max) { min -= 1; max += 1; }
    const padding = (max - min) * 0.08;
    const rangeMin = min - padding;
    const rangeMax = max + padding;
    const range = rangeMax - rangeMin || 1;
    const slot = plotW / candles.length;
    const bodyW = Math.max(2, Math.min(12, slot * 0.62));
    const yFor = (price: number) => topPad + ((rangeMax - price) / range) * plotH;
    const xFor = (i: number) => i * slot + slot / 2;
    const gridLines = 5;
    const priceTicks = Array.from({ length: gridLines + 1 }, (_, i) => rangeMin + (range * i) / gridLines);
    const timeStops = [0, Math.floor(candles.length / 4), Math.floor(candles.length / 2), Math.floor((candles.length * 3) / 4), candles.length - 1]
      .filter((v, i, arr) => v >= 0 && arr.indexOf(v) === i);
    return { rangeMin, rangeMax, range, slot, bodyW, yFor, xFor, priceTicks, timeStops };
  }, [candles, plotW, plotH, entryPrice, takeProfitPrice, stopLossPrice, indicators]);

  if (!layout) return null;
  const { yFor, xFor, priceTicks, timeStops, bodyW } = layout;
  const last = candles[candles.length - 1];
  const lastBull = last.close >= last.open;
  const lastColor = lastBull ? '#7AE2AA' : '#FB7185';

  const formatPrice = (p: number) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatClock = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const overlayPoints = (series: (number | null)[] | undefined) => {
    if (!series) return null;
    const pts: string[] = [];
    for (let i = 0; i < series.length && i < candles.length; i++) {
      const v = series[i];
      if (v == null) continue;
      pts.push(`${xFor(i)},${yFor(v)}`);
    }
    return pts.length >= 2 ? pts.join(' ') : null;
  };
  const smaPoints = overlayPoints(indicators?.sma);
  const vwapPoints = overlayPoints(indicators?.vwap);

  const rsiY = (v: number) => RSI_PANEL_HEIGHT - (Math.max(0, Math.min(100, v)) / 100) * RSI_PANEL_HEIGHT;
  const rsiPoints = (() => {
    if (!rsi) return null;
    const pts: string[] = [];
    for (let i = 0; i < rsi.length && i < candles.length; i++) {
      const v = rsi[i];
      if (v == null) continue;
      pts.push(`${xFor(i)},${rsiY(v)}`);
    }
    return pts.length >= 2 ? pts.join(' ') : null;
  })();

  const bracketLine = (price: number, label: string, color: string) => (
    <g key={label}>
      <line x1={0} y1={yFor(price)} x2={plotW} y2={yFor(price)} stroke={color} strokeWidth={1} strokeDasharray="3 4" opacity={0.8} />
      <rect x={4} y={yFor(price) - 8} width={26} height={16} rx={4} fill={color} opacity={0.9} />
      <text x={17} y={yFor(price) + 4} fontSize={8} fontWeight={700} fill="#0B0714" textAnchor="middle">{label}</text>
    </g>
  );

  return (
    <div style={{ width }}>
      <div style={{ width, height, borderRadius: 12, overflow: 'hidden', background: 'var(--background)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 8, left: 10, zIndex: 1, display: 'flex', flexWrap: 'wrap', columnGap: 10, rowGap: 2 }}>
          {symbol ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted-foreground)', marginRight: 2 }}>{symbol}</span> : null}
          {([['O', last.open], ['H', last.high], ['L', last.low], ['C', last.close]] as const).map(([label, value]) => (
            <span key={label} style={{ fontSize: 10, fontWeight: 600, color: label === 'C' ? lastColor : 'var(--muted-foreground)' }}>
              {label} <span style={{ color: label === 'C' ? lastColor : 'var(--foreground)' }}>{formatPrice(value)}</span>
            </span>
          ))}
        </div>
        <svg width={width} height={height}>
          {symbol ? (
            <text x={plotW / 2} y={topPad + plotH / 2 + plotH * 0.09} fontSize={Math.min(plotW, plotH) * 0.42} fontWeight={700} fill="var(--border)" opacity={0.4} textAnchor="middle">
              {symbol}
            </text>
          ) : null}
          {timeStops.map((i) => (
            <line key={`vgrid-${i}`} x1={xFor(i)} y1={topPad} x2={xFor(i)} y2={topPad + plotH} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
          ))}
          {priceTicks.map((p, i) => {
            const y = yFor(p);
            return (
              <g key={`grid-${i}`}>
                <line x1={0} y1={y} x2={plotW} y2={y} stroke="var(--border)" strokeWidth={1} opacity={0.35} />
                <text x={plotW + 8} y={y + 3} fontSize={9} fill="var(--muted-foreground)">{formatPrice(p)}</text>
              </g>
            );
          })}
          <line x1={plotW} y1={0} x2={plotW} y2={height - bottomGutter} stroke="var(--border)" strokeWidth={1} opacity={0.7} />
          <line x1={0} y1={height - bottomGutter} x2={plotW} y2={height - bottomGutter} stroke="var(--border)" strokeWidth={1} opacity={0.7} />
          {timeStops.map((i) => (
            <text key={`time-${i}`} x={xFor(i)} y={height - 5} fontSize={9} fill="var(--muted-foreground)" textAnchor="middle">{formatClock(candles[i].time)}</text>
          ))}
          {candles.map((c, i) => {
            const bull = c.close >= c.open;
            const color = bull ? '#7AE2AA' : '#FB7185';
            const cx = xFor(i);
            const bodyTop = yFor(Math.max(c.open, c.close));
            const bodyBottom = yFor(Math.min(c.open, c.close));
            const bodyH = Math.max(1.5, bodyBottom - bodyTop);
            return (
              <g key={c.time}>
                <line x1={cx} y1={yFor(c.high)} x2={cx} y2={yFor(c.low)} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
                <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={1} />
              </g>
            );
          })}
          {vwapPoints ? <polyline points={vwapPoints} fill="none" stroke="#E2C25A" strokeWidth={1.6} opacity={0.85} /> : null}
          {smaPoints ? <polyline points={smaPoints} fill="none" stroke="#60A5FA" strokeWidth={1.6} opacity={0.9} /> : null}
          {entryPrice != null ? (
            <g>
              <line x1={0} y1={yFor(entryPrice)} x2={plotW} y2={yFor(entryPrice)} stroke={entrySide === 'short' ? '#FB7185' : '#7AE2AA'} strokeWidth={1} strokeDasharray="3 4" opacity={0.8} />
              <rect x={4} y={yFor(entryPrice) - 8} width={38} height={16} rx={4} fill={entrySide === 'short' ? '#FB7185' : '#7AE2AA'} opacity={0.9} />
              <text x={23} y={yFor(entryPrice) + 4} fontSize={8} fontWeight={700} fill="#0B0714" textAnchor="middle">ENTRY</text>
            </g>
          ) : null}
          {takeProfitPrice != null ? bracketLine(takeProfitPrice, 'TP', '#7AE2AA') : null}
          {stopLossPrice != null ? bracketLine(stopLossPrice, 'SL', '#FB7185') : null}
          <line x1={0} y1={yFor(last.close)} x2={plotW} y2={yFor(last.close)} stroke="var(--primary)" strokeWidth={1} strokeDasharray="2 3" opacity={0.85} />
          <rect x={plotW} y={yFor(last.close) - 9} width={axisGutter} height={18} rx={4} fill="var(--primary)" />
          <text x={plotW + axisGutter / 2} y={yFor(last.close) + 4} fontSize={9} fontWeight={700} fill="var(--primary-foreground)" textAnchor="middle">{formatPrice(last.close)}</text>
        </svg>
      </div>
      {showRsi ? (
        <div style={{ width, height: RSI_PANEL_HEIGHT, marginTop: RSI_PANEL_GAP, borderRadius: 10, overflow: 'hidden', background: 'var(--background)' }}>
          <svg width={width} height={RSI_PANEL_HEIGHT}>
            {[30, 50, 70].map((level) => {
              const y = rsiY(level);
              return (
                <g key={`rsi-grid-${level}`}>
                  <line x1={0} y1={y} x2={plotW} y2={y} stroke="var(--border)" strokeWidth={1} opacity={level === 50 ? 0.35 : 0.55} strokeDasharray={level === 50 ? undefined : '3 3'} />
                  <text x={plotW + 8} y={y + 3} fontSize={8} fill="var(--muted-foreground)">{level}</text>
                </g>
              );
            })}
            {rsiPoints ? <polyline points={rsiPoints} fill="none" stroke="#C084FC" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /> : null}
            <text x={6} y={11} fontSize={8} fontWeight={700} fill="var(--muted-foreground)">RSI (14)</text>
          </svg>
        </div>
      ) : null}
    </div>
  );
}

// ── Learning: Live Trading Simulator game ─────────────────────────────────────────
// Companion lessons this game pairs with — chosen from web's own module
// registry (mobile's Anatomy of an Evaluation is a funded-track lesson that
// doesn't exist on web) so both links always resolve to a real module.
const SIM_COMPANION_LESSON_IDS = ['contract-sizing-leverage', 'risk-and-psychology'];
const SIM_MIN_WIDTH = 320;
const SIM_MIN_HEIGHT = 160;
const SIM_MAX_HEIGHT = 720;

function pickMockTicker(): MockFuturesTicker { return MOCK_FUTURES_TICKERS[Math.floor(Math.random() * MOCK_FUTURES_TICKERS.length)]; }

interface SimSessionSeed { ticker: MockFuturesTicker; startPrice: number; volatility: number; candles: SimCandle[] }
function createSimSession(timeframe: SimTimeframe): SimSessionSeed {
  const startPrice = randomSimStartPrice();
  const volatility = volatilityForPrice(startPrice);
  const config = SIM_TIMEFRAME_CONFIG[timeframe];
  const candles = seedSimCandles(SIM_VISIBLE_CANDLES, startPrice, volatility * config.volatilityMultiplier, Date.now(), config.candleDurationMs);
  return { ticker: pickMockTicker(), startPrice, volatility, candles };
}

function TradingSimulatorGame({
  progress, setProgress, onOpenLesson,
}: {
  progress: LearningProgress;
  setProgress: React.Dispatch<React.SetStateAction<LearningProgress>>;
  onOpenLesson: (id: string) => void;
}) {
  const [timeframe, setTimeframe] = useState<SimTimeframe>('1m');
  const [session, setSession] = useState<SimSessionSeed>(() => createSimSession('1m'));
  const [candles, setCandles] = useState<SimCandle[]>(() => session.candles);
  const [account, setAccount] = useState<SimAccountState>(() => blankSimAccount());
  const [qty, setQty] = useState(1);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'live' | 'ended'>('live');
  const [endedReason, setEndedReason] = useState<'breach' | 'manual'>('manual');
  const [expanded, setExpanded] = useState(false);
  const [customSize, setCustomSize] = useState<{ width: number; height: number } | null>(null);

  const [instrument, setInstrument] = useState<SimInstrumentId>('MNQ');
  const pointValue = SIM_INSTRUMENTS[instrument].pointValue;

  const [tpOffset, setTpOffset] = useState(20);
  const [slOffset, setSlOffset] = useState(10);
  const [bracketMessage, setBracketMessage] = useState<string | null>(null);

  const [maOn, setMaOn] = useState(false);
  const [vwapOn, setVwapOn] = useState(false);
  const [rsiOn, setRsiOn] = useState(false);

  const [savedXp, setSavedXp] = useState(0);
  const [saved, setSaved] = useState(false);

  const ticksRef = useRef(0);
  const peakEquityRef = useRef(SIM_STARTING_BALANCE);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(640);
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Auto-fit the chart to whatever width its column has — same idea as the
  // mobile screen's onLayout measurement — unless the member has dragged a
  // custom size, in which case we only clamp it down if the window shrinks.
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(Math.max(SIM_MIN_WIDTH, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const defaultHeight = expanded ? 460 : 240;
  const chartHeight = Math.max(SIM_MIN_HEIGHT, Math.min(SIM_MAX_HEIGHT, customSize?.height ?? defaultHeight));
  const chartWidth = Math.max(SIM_MIN_WIDTH, Math.min(containerWidth, customSize?.width ?? containerWidth));

  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    resizingRef.current = { startX: e.clientX, startY: e.clientY, startW: chartWidth, startH: chartHeight };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizingRef.current) return;
    const dx = e.clientX - resizingRef.current.startX;
    const dy = e.clientY - resizingRef.current.startY;
    const nextW = Math.max(SIM_MIN_WIDTH, Math.min(containerWidth, resizingRef.current.startW + dx));
    const nextH = Math.max(SIM_MIN_HEIGHT, Math.min(SIM_MAX_HEIGHT, resizingRef.current.startH + dy));
    setCustomSize({ width: nextW, height: nextH });
  };
  const onResizeEnd = (e: React.PointerEvent) => {
    resizingRef.current = null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const resetChartSize = () => setCustomSize(null);

  // Live ticking — re-paces itself the instant `timeframe` changes without
  // resetting the account or chart history, so switching tabs visibly speeds
  // up or slows down the exact same session.
  useEffect(() => {
    if (status !== 'live' || paused) return;
    const config = SIM_TIMEFRAME_CONFIG[timeframe];
    const interval = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        ticksRef.current += 1;
        const tickVolatility = session.volatility * config.volatilityMultiplier;
        if (ticksRef.current > config.ticksPerCandle) {
          ticksRef.current = 1;
          const opened = openSimCandle(last.close, last.time + config.candleDurationMs);
          const ticked = tickSimCandle(opened, tickVolatility);
          return [...prev.slice(1), ticked];
        }
        const ticked = tickSimCandle(last, tickVolatility);
        return [...prev.slice(0, -1), ticked];
      });
    }, config.tickMs);
    return () => clearInterval(interval);
  }, [status, paused, timeframe, session.volatility]);

  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle ? lastCandle.close : session.startPrice;
  const balance = simBalance(account);
  const unrealized = simUnrealizedPnl(account, lastPrice, pointValue);
  const equity = simEquity(account, lastPrice, pointValue);

  useEffect(() => {
    if (status !== 'live') return;
    peakEquityRef.current = Math.max(peakEquityRef.current, equity);
    if (isSimBreached(account, lastPrice, pointValue)) {
      setStatus('ended');
      setEndedReason('breach');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equity, status]);

  useEffect(() => {
    if (status !== 'live' || !account.position) return;
    const pos = account.position;
    if (pos.takeProfit == null && pos.stopLoss == null) return;
    const latest = candles[candles.length - 1];
    if (!latest) return;
    const hit = checkSimBracketHit(pos, latest);
    if (!hit) return;
    setAccount((prev) => closeSimPosition(prev, hit.price, Date.now(), pointValue));
    setBracketMessage(hit.kind === 'takeProfit' ? `Take-profit filled at $${hit.price.toFixed(2)}` : `Stop-loss filled at $${hit.price.toFixed(2)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  useEffect(() => {
    if (!bracketMessage) return;
    const t = setTimeout(() => setBracketMessage(null), 6000);
    return () => clearTimeout(t);
  }, [bracketMessage]);

  const smaSeries = useMemo(() => (maOn ? computeSMA(candles, 20) : undefined), [maOn, candles]);
  const vwapSeries = useMemo(() => (vwapOn ? computeSessionVwap(candles) : undefined), [vwapOn, candles]);
  const rsiSeries = useMemo(() => (rsiOn ? computeRSI(candles, 14) : undefined), [rsiOn, candles]);

  useEffect(() => {
    if (status !== 'ended' || saved) return;
    const grewPast = Math.max(0, peakEquityRef.current - SIM_STARTING_BALANCE);
    const xpEarned = Math.max(20, 30 + Math.round(grewPast / 20) + (endedReason === 'manual' && equity >= SIM_STARTING_BALANCE ? 40 : 0));
    setSavedXp(xpEarned);
    setSaved(true);
    setProgress((prev) => ({
      ...prev,
      xp: prev.xp + xpEarned,
      completedModules: prev.completedModules.includes('trading-simulator') ? prev.completedModules : [...prev.completedModules, 'trading-simulator'],
      liveSimGame: {
        bestEquity: Math.max(prev.liveSimGame.bestEquity, peakEquityRef.current),
        timesBreached: prev.liveSimGame.timesBreached + (endedReason === 'breach' ? 1 : 0),
        plays: prev.liveSimGame.plays + 1,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const placeOrder = (side: SimSide) => {
    if (status !== 'live') return;
    setBracketMessage(null);
    setAccount((prev) => placeSimMarketOrder(prev, side, qty, lastPrice, Date.now(), pointValue));
  };
  const handleClosePosition = () => {
    if (status !== 'live' || !account.position) return;
    setBracketMessage(null);
    setAccount((prev) => closeSimPosition(prev, lastPrice, Date.now(), pointValue));
  };
  const applyBracket = () => {
    const pos = account.position;
    if (!pos) return;
    const takeProfit = pos.side === 'long' ? pos.avgPrice + tpOffset : pos.avgPrice - tpOffset;
    const stopLoss = pos.side === 'long' ? pos.avgPrice - slOffset : pos.avgPrice + slOffset;
    setAccount((prev) => setSimBracket(prev, takeProfit, stopLoss));
  };
  const clearBracket = () => setAccount((prev) => setSimBracket(prev, null, null));
  const endSessionManually = () => {
    if (status !== 'live') return;
    setStatus('ended');
    setEndedReason('manual');
  };
  const resetSession = () => {
    const next = createSimSession(timeframe);
    setSession(next);
    setCandles(next.candles);
    setAccount(blankSimAccount());
    setQty(1);
    setStatus('live');
    setEndedReason('manual');
    setSaved(false);
    setBracketMessage(null);
    ticksRef.current = 0;
    peakEquityRef.current = SIM_STARTING_BALANCE;
  };
  const adjustQty = (delta: number) => setQty((q) => Math.max(1, Math.min(50, q + delta)));

  const companionLessons = SIM_COMPANION_LESSON_IDS.map((id) => LEARNING_MODULES.find((m) => m.id === id)).filter((m): m is LearningModule => !!m);

  if (status === 'ended') {
    const profitable = equity >= SIM_STARTING_BALANCE;
    const manualBody = `You closed out at ${simMoney(equity)} equity, starting from ${simMoney(SIM_STARTING_BALANCE)}.`;
    const outcome = endedReason === 'breach'
      ? { Icon: AlertTriangle, color: '#FB7185', title: 'Max loss limit hit.', body: `Simulated equity hit ${simMoney(equity)}, at or below the $${SIM_MLL_FLOOR.toLocaleString()} floor. On a real evaluation, this ends the account immediately — no recovery, no second chance.` }
      : profitable
        ? { Icon: Trophy, color: '#7AE2AA', title: 'Session ended.', body: manualBody }
        : { Icon: Flag, color: '#FDBA74', title: 'Session ended.', body: manualBody };
    const OutcomeIcon = outcome.Icon;
    return (
      <div className="surface game-recap animate-in" data-testid="panel-simulator-recap">
        <OutcomeIcon size={26} color={outcome.color} />
        <h3>{outcome.title}</h3>
        <p>{outcome.body}</p>
        <div className="sim-recap-stats-row">
          <div className="sim-recap-stat"><span className="tiny muted">FINAL EQUITY</span><strong>{simMoney(equity)}</strong></div>
          <div className="sim-recap-stat"><span className="tiny muted">PEAK EQUITY</span><strong>{simMoney(peakEquityRef.current)}</strong></div>
          <div className="sim-recap-stat"><span className="tiny muted">TRADES</span><strong>{account.trades.length}</strong></div>
        </div>
        <div className="status-pill status-active" style={{ marginTop: 6 }}><Zap size={11} /> +{savedXp} XP earned</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="button button-primary" onClick={resetSession} data-testid="button-restart-simulator"><RotateCcw size={13} /> Start new session</button>
        </div>
        <p className="muted tiny" style={{ marginTop: 16 }}>
          Best equity ever: {simMoney(Math.max(progress.liveSimGame.bestEquity, peakEquityRef.current))} · {progress.liveSimGame.plays + 1} session(s) played
        </p>
      </div>
    );
  }

  const position = account.position;

  return (
    <div className="sim-layout animate-in" data-testid="panel-trading-simulator">
      <div className="sim-chart-column">
        <div className="sim-badge surface-dark">
          <FlaskConical size={13} />
          <span>Live practice sim — every price is randomly generated in your browser. Not a real quote, a real fill, or a real funded account.</span>
        </div>

        {bracketMessage ? (
          <div className="sim-bracket-banner surface-dark" data-testid="banner-bracket-message">
            <Flag size={13} />
            <span>{bracketMessage}</span>
          </div>
        ) : null}

        <div className="surface sim-stats-card">
          <div className="sim-stats-row">
            <div className="sim-stat"><span className="eyebrow">BAL</span><strong>{simMoney(balance)}</strong></div>
            <div className="sim-stat"><span className="eyebrow">MLL</span><strong>{simMoney(SIM_MLL_FLOOR)}</strong></div>
            <div className="sim-stat"><span className="eyebrow">RP&amp;L</span><strong style={{ color: account.realizedPnl > 0 ? '#7AE2AA' : account.realizedPnl < 0 ? '#FB7185' : undefined }}>{simMoney(account.realizedPnl)}</strong></div>
            <div className="sim-stat"><span className="eyebrow">UP&amp;L</span><strong style={{ color: unrealized > 0 ? '#7AE2AA' : unrealized < 0 ? '#FB7185' : undefined }}>{simMoney(unrealized)}</strong></div>
          </div>
        </div>

        <div className="surface sim-chart-card">
          <div className="sim-chart-head">
            <div className="sim-ticker-badge"><span>{session.ticker.symbol}</span></div>
            <div className="sim-ticker-info">
              <strong>{session.ticker.name}</strong>
              <span className="muted tiny">${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <button className="icon-button sim-icon-button" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Resume' : 'Pause'} data-testid="button-pause-simulator">
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button className="icon-button sim-icon-button" onClick={resetSession} aria-label="Reset session" data-testid="button-reset-simulator">
              <RotateCcw size={16} />
            </button>
            <button className="icon-button sim-icon-button" onClick={() => { setExpanded((e) => !e); setCustomSize(null); }} aria-label={expanded ? 'Collapse chart' : 'Expand chart'} data-testid="button-expand-simulator">
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>

          <div className="sim-timeframe-row">
            {SIM_TIMEFRAMES.map((tf) => (
              <button key={tf} className={`sim-tab ${tf === timeframe ? 'sim-tab--active' : ''}`} onClick={() => setTimeframe(tf)} data-testid={`button-timeframe-${tf}`}>{tf}</button>
            ))}
          </div>

          <div className="sim-instrument-row">
            {SIM_INSTRUMENT_IDS.map((id) => {
              const spec = SIM_INSTRUMENTS[id];
              const active = id === instrument;
              const locked = !!account.position && !active;
              return (
                <button
                  key={id}
                  disabled={locked}
                  className={`sim-tab ${active ? 'sim-tab--active' : ''}`}
                  style={locked ? { opacity: 0.4, cursor: 'default' } : undefined}
                  onClick={() => setInstrument(id)}
                  data-testid={`button-instrument-${id.toLowerCase()}`}
                >
                  {spec.symbol} · ${spec.pointValue}/pt
                </button>
              );
            })}
          </div>
          <p className="muted tiny" style={{ margin: '6px 0 0' }}>
            NQ's real CME multiplier is $20/point; MNQ is exactly 1/10th at $2/point — a 10-point move is {simMoney(10 * SIM_INSTRUMENTS.NQ.pointValue)} on NQ vs {simMoney(10 * SIM_INSTRUMENTS.MNQ.pointValue)} on MNQ.
            {account.position ? ' Flatten your position to switch contracts.' : ''}
          </p>

          <div className="sim-indicator-row">
            {([
              { key: 'ma', label: 'MA(20)', active: maOn, toggle: () => setMaOn((v) => !v) },
              { key: 'vwap', label: 'VWAP', active: vwapOn, toggle: () => setVwapOn((v) => !v) },
              { key: 'rsi', label: 'RSI(14)', active: rsiOn, toggle: () => setRsiOn((v) => !v) },
            ] as const).map((ind) => (
              <button key={ind.key} className={`sim-tab sim-tab--small ${ind.active ? 'sim-tab--active' : ''}`} onClick={ind.toggle} data-testid={`button-indicator-${ind.key}`}>{ind.label}</button>
            ))}
          </div>

          <div ref={chartWrapRef} className="sim-chart-wrap">
            {chartWidth > 0 ? (
              <LiveCandleChart
                candles={candles}
                width={chartWidth}
                height={chartHeight}
                entryPrice={position ? position.avgPrice : null}
                entrySide={position ? position.side : null}
                takeProfitPrice={position?.takeProfit ?? null}
                stopLossPrice={position?.stopLoss ?? null}
                indicators={{ sma: smaSeries, vwap: vwapSeries }}
                rsi={rsiSeries}
                symbol={session.ticker.symbol}
              />
            ) : null}
            <div
              className="sim-resize-handle"
              onPointerDown={onResizeStart}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeEnd}
              role="separator"
              aria-label="Drag to scale the chart"
              data-testid="handle-resize-simulator-chart"
            />
          </div>
          {customSize ? (
            <button className="sim-reset-size-link" onClick={resetChartSize} data-testid="button-reset-chart-size">Reset chart size</button>
          ) : null}
        </div>
      </div>

      <div className="sim-order-column">
        {companionLessons.map((lesson) => {
          const Icon = lesson.icon;
          return (
            <div key={lesson.id} className="surface sim-lesson-card">
              <div className="sim-lesson-head">
                <div className="module-icon"><Icon size={18} /></div>
                <div>
                  <span className="eyebrow">Pairs with this module</span>
                  <h3 style={{ margin: '2px 0 0', fontSize: 14 }}>{lesson.title}</h3>
                </div>
              </div>
              <p className="muted tiny" style={{ margin: '10px 0 14px' }}>{lesson.tagline}</p>
              <button className="button button-outline" style={{ width: '100%' }} onClick={() => onOpenLesson(lesson.id)} data-testid={`button-open-companion-${lesson.id}`}>
                Continue lesson <ArrowRight size={13} />
              </button>
            </div>
          );
        })}

        {position ? (
          <div className="surface sim-position-card" data-testid="card-simulator-position">
            <div className="sim-position-head">
              <span className={`status-pill ${position.side === 'long' ? 'status-active' : 'status-stopped'}`}>{position.side === 'long' ? 'LONG' : 'SHORT'}</span>
              <strong>{position.qty} @ {position.avgPrice.toFixed(2)}</strong>
            </div>
            <p style={{ fontWeight: 700, color: unrealized > 0 ? '#7AE2AA' : unrealized < 0 ? '#FB7185' : 'var(--foreground)', margin: '8px 0 12px' }}>
              {unrealized >= 0 ? '+' : ''}{simMoney(unrealized)} unrealized
            </p>
            <button className="button button-outline" style={{ width: '100%' }} onClick={handleClosePosition} data-testid="button-close-position">
              <X size={14} /> Close position
            </button>

            <div className="sim-bracket-section">
              <span className="eyebrow">Take-profit / stop-loss</span>
              {position.takeProfit != null || position.stopLoss != null ? (
                <div className="sim-bracket-active-row">
                  <span className="muted tiny">{position.takeProfit != null ? `TP $${position.takeProfit.toFixed(2)}` : 'TP off'} · {position.stopLoss != null ? `SL $${position.stopLoss.toFixed(2)}` : 'SL off'}</span>
                  <button className="sim-clear-link" onClick={clearBracket} data-testid="button-clear-bracket">Clear</button>
                </div>
              ) : (
                <>
                  <div className="sim-bracket-row">
                    <div className="sim-bracket-stepper-group">
                      <span className="tiny muted">TP +{tpOffset}pt</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="sim-qty-stepper" onClick={() => setTpOffset((v) => Math.max(5, v - 5))} data-testid="button-tp-decrease"><Minus size={13} /></button>
                        <button className="sim-qty-stepper" onClick={() => setTpOffset((v) => Math.min(300, v + 5))} data-testid="button-tp-increase"><Plus size={13} /></button>
                      </div>
                    </div>
                    <div className="sim-bracket-stepper-group">
                      <span className="tiny muted">SL -{slOffset}pt</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="sim-qty-stepper" onClick={() => setSlOffset((v) => Math.max(5, v - 5))} data-testid="button-sl-decrease"><Minus size={13} /></button>
                        <button className="sim-qty-stepper" onClick={() => setSlOffset((v) => Math.min(300, v + 5))} data-testid="button-sl-increase"><Plus size={13} /></button>
                      </div>
                    </div>
                  </div>
                  <button className="button button-dark" style={{ width: '100%' }} onClick={applyBracket} data-testid="button-apply-bracket">Set TP/SL on this position</button>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="surface sim-order-card">
          <span className="eyebrow">Market order</span>
          <div className="sim-qty-row">
            <button className="sim-qty-stepper" onClick={() => adjustQty(-1)} data-testid="button-qty-decrease"><Minus size={14} /></button>
            {SIM_QTY_PRESETS.map((preset) => (
              <button key={preset} className={`sim-qty-preset ${preset === qty ? 'sim-qty-preset--active' : ''}`} onClick={() => setQty(preset)} data-testid={`button-qty-${preset}`}>{preset}</button>
            ))}
            <button className="sim-qty-stepper" onClick={() => adjustQty(1)} data-testid="button-qty-increase"><Plus size={14} /></button>
          </div>
          <div className="sim-order-buttons">
            <button className="sim-order-button sim-order-button--buy" onClick={() => placeOrder('long')} data-testid="button-buy-market">Buy +{qty} Market</button>
            <button className="sim-order-button sim-order-button--sell" onClick={() => placeOrder('short')} data-testid="button-sell-market">Sell +{qty} Market</button>
          </div>
          <button className="sim-end-session-link" onClick={endSessionManually} data-testid="button-end-simulator-session">End session</button>
        </div>
      </div>
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
// Mirrors VALID_STYLES in artifacts/api-server/src/routes/signals.ts.
const VALID_SIGNAL_STYLES: SignalStyle[] = ['Day Trade', 'Swing', 'Buy & Hold', 'LEAPS'];

type SignalForm = {
  asset: string; sector: string; market: 'Stocks' | 'Crypto'; direction: 'Long' | 'Short';
  status: SignalStatus; style: SignalStyle; timeframe: string; entry: string; target: string;
  stop: string; risk: string; analysis: string; isOption: boolean;
  optionType: 'Call' | 'Put'; contract: string; contractAmount: string; expiration: string; strike: string;
  premium: string; bid: string; ask: string; impliedVolatility: string;
  delta: string; gamma: string; theta: string; vega: string; openInterest: string;
  /** Optional chart screenshot for "Wick's Read" — a data URL, or null when none is attached. */
  analysisImage: string | null;
};

const blankSignalForm: SignalForm = {
  asset: '', sector: '', market: 'Stocks', direction: 'Long', status: 'Active', style: 'Swing',
  timeframe: '', entry: '', target: '', stop: '', risk: 'Medium', analysis: '',
  isOption: false, optionType: 'Call', contract: '', contractAmount: '1', expiration: '', strike: '',
  premium: '', bid: '', ask: '', impliedVolatility: '', delta: '', gamma: '',
  theta: '', vega: '', openInterest: '', analysisImage: null,
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

  const onPickAnalysisImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    }).catch(() => null);
    if (dataUrl) upd('analysisImage', dataUrl);
  };

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
        <div className="sf-field">
          <label className="sf-label">Style</label>
          {/* LEAPS must be an options contract and Buy & Hold must not be — see the
              matching checks in POST/PATCH /api/signals — so switching style here
              flips the Signal type toggle above along with it rather than letting
              the admin hit that validation error after filling in the rest of the form. */}
          <select
            className="sf-input sf-select"
            value={form.style}
            onChange={(e) => {
              const next = e.target.value as SignalStyle;
              upd('style', next);
              if (next === 'LEAPS' && !form.isOption) upd('isOption', true);
              if (next === 'Buy & Hold' && form.isOption) upd('isOption', false);
            }}
            data-testid="select-signal-style"
          >
            {VALID_SIGNAL_STYLES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <SF label="Sector (optional)" name="sector" placeholder="e.g. Technology" />
        <Sel label="Status" name="status" options={['Active','Watching','Closed','Stopped']} />
      </div>
      <div className="sf-grid-3">
        <SF label="Timeframe" name="timeframe" placeholder="e.g. 2–5 days" />
        <Sel label="Risk" name="risk" options={['Low','Medium','Moderate','Elevated','High']} />
        <SF label={form.isOption ? 'Debit / entry' : 'Entry'} name="entry" placeholder="$3.42" />
      </div>
      <div className="sf-grid-3">
        <SF label="Target" name="target" placeholder="$5.10" />
        {/* Buy & Hold is a long-term thesis with no hard stop — see signalStyleEnum
            in lib/db/src/schema/signals.ts. Left editable (not required, see
            submit() below) rather than hidden, in case an admin wants to note one anyway. */}
        <SF label={form.style === 'Buy & Hold' ? 'Stop (optional for Buy & Hold)' : 'Stop'} name="stop" placeholder={form.style === 'Buy & Hold' ? 'No stop — long-term thesis' : '$2.10'} />
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
          <SF label="Contracts" name="contractAmount" placeholder="1" />
          <SF label="Strike" name="strike" placeholder="$130.00" />
          <SF label="Premium" name="premium" placeholder="$3.42" />
        </div>
        <div className="sf-grid-2">
          <SF label="Bid" name="bid" placeholder="$3.38" />
          <SF label="Ask" name="ask" placeholder="$3.46" />
        </div>
        <div className="sf-section-label" style={{marginTop:4}}>Greeks & liquidity (at entry)</div>
        <div className="sf-grid-4">
          <SF label="IV" name="impliedVolatility" placeholder="48.6%" />
          <SF label="Delta Δ" name="delta" placeholder="0.42" />
          <SF label="Gamma Γ" name="gamma" placeholder="0.018" />
          <SF label="Theta Θ" name="theta" placeholder="-0.11" />
        </div>
        <div className="sf-grid-2">
          <SF label="Vega V" name="vega" placeholder="0.19" />
          <SF label="Open interest" name="openInterest" placeholder="18,420" />
        </div>
      </>)}

      {/* Analysis */}
      <div className="sf-section-label" style={{marginTop:8}}>Wick's read</div>
      <SF label="Analysis" name="analysis" placeholder="Explain the setup, context, and invalidation level..." multiline />
      <div className="sf-field">
        <label className="sf-label">Chart screenshot (optional)</label>
        <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
          {form.analysisImage && (
            <div style={{position:'relative'}}>
              <img src={form.analysisImage} alt="Chart screenshot preview" style={{width:140,height:90,objectFit:'cover',borderRadius:10,border:'1px solid var(--border)'}} />
              <button
                type="button"
                onClick={() => upd('analysisImage', null)}
                aria-label="Remove chart screenshot"
                style={{position:'absolute',top:-8,right:-8,width:22,height:22,borderRadius:11,border:'1px solid var(--border)',background:'var(--card)',cursor:'pointer',display:'grid',placeItems:'center'}}
              >
                <X size={12} />
              </button>
            </div>
          )}
          <label className="button button-outline" style={{fontSize:12,cursor:'pointer'}}>
            <Camera size={13} /> {form.analysisImage ? 'Change screenshot' : 'Attach chart screenshot'}
            <input type="file" accept="image/*" onChange={(e) => void onPickAnalysisImage(e)} style={{display:'none'}} data-testid="input-analysis-image" />
          </label>
        </div>
      </div>

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
  const [stats, setStats] = useState<ScoreboardStats | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  // Manual trigger for the auto scanner (services/signalScanner.ts's
  // runSignalScan — the watchlist-first swing/LEAPS/Buy & Hold scan), distinct
  // from the AI screenshot scan above. Fire-and-forget on the server: this
  // just confirms it started, then a "Refresh" a minute or two later is how
  // you'll actually see whatever it found show up as new Watching signals.
  const [runningScan, setRunningScan] = useState(false);
  const [scanRunMessage, setScanRunMessage] = useState('');

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
      if (r.ok) {
        const d = await r.json() as { signals: Signal[]; stats?: ScoreboardStats };
        setSignals(d.signals ?? []);
        setStats(d.stats ?? null);
      }
    } catch { /* ignore */ }
    finally { setLoadingSignals(false); }
  }, [getToken]);

  useEffect(() => { void fetchSignals(); }, [fetchSignals]);

  if (user?.role !== 'admin') return <div className="page"><div className="empty-state"><ShieldCheck size={24}/><h3>Admin only</h3><p>This room is not accessible to members.</p></div></div>;

  const startEdit = (s: Signal) => {
    setEditingId(s.id);
    setError(''); setSuccess('');
    setForm({
      asset: s.asset, sector: s.sector ?? '', market: s.market, direction: s.direction, status: s.status,
      style: s.style ?? 'Swing',
      timeframe: s.timeframe, entry: s.entry, target: s.target, stop: s.stop,
      risk: s.risk, analysis: s.analysis, isOption: s.isOption ?? false,
      optionType: (s.optionType as 'Call' | 'Put') ?? 'Call',
      contract: s.contract ?? '', contractAmount: s.contractAmount != null ? String(s.contractAmount) : '1',
      expiration: s.expiration ?? '', strike: s.strike ?? '',
      premium: s.premium ?? '', bid: s.bid ?? '', ask: s.ask ?? '',
      impliedVolatility: s.impliedVolatility ?? '',
      delta: s.delta != null ? String(s.delta) : '',
      gamma: s.gamma != null ? String(s.gamma) : '',
      theta: s.theta != null ? String(s.theta) : '',
      vega: s.vega != null ? String(s.vega) : '',
      openInterest: s.openInterest ?? '',
      analysisImage: s.analysisImageDataUrl ?? null,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => { setEditingId(null); setForm(blankSignalForm); setError(''); setSuccess(''); };

  const submit = async () => {
    // Buy & Hold is a long-term thesis with deliberately no hard stop — see
    // signalStyleEnum in lib/db/src/schema/signals.ts and the matching
    // "stopRequired" check in POST /api/signals. Every other style still needs one.
    const stopRequired = form.style !== 'Buy & Hold';
    const requiredFields = [form.asset, form.timeframe, form.entry, form.target, form.analysis, ...(stopRequired ? [form.stop] : [])];
    if (!requiredFields.every((v) => v.trim())) {
      setError(`Fill in all required fields: ticker, timeframe, entry, target${stopRequired ? ', stop,' : ','} and analysis.`); return;
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
          // Only a genuine positive number changes contractAmount — same
          // "leave as-is / default to 1 unless specified" behavior the API
          // enforces (it rejects an explicit null, so this never sends one).
          contractAmount: form.contractAmount.trim() && Number(form.contractAmount) > 0 ? Math.round(Number(form.contractAmount)) : undefined,
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
      asset: form.asset.trim().toUpperCase(), sector: optStr(form.sector), market: form.market, direction: form.direction,
      status: form.status, style: form.style, entry: form.entry.trim(), target: form.target.trim(),
      // Buy & Hold sends null/undefined (via optStr) instead of an empty string
      // when the field was left blank, same "leave unset" treatment as every
      // other optional field below rather than writing a literal "" to the column.
      stop: optStr(form.stop), timeframe: form.timeframe.trim(), risk: form.risk.trim(),
      analysis: form.analysis.trim(), isOption: form.isOption,
      // Wick's Read screenshot applies to every signal, not just options —
      // null explicitly clears a previously attached one on edit.
      analysisImageDataUrl: form.analysisImage,
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

  // Scoreboard "did this call actually do 20%+" check — see
  // services/signalScoreboard.ts's verifySignalMove. Only works for plain
  // Stocks/Crypto spot signals; options/LEAPS always come back non-verifiable
  // and need a manual resultTag set via Edit instead.
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState<{ id: string; text: string } | null>(null);

  const verifySignal = async (id: string) => {
    setVerifyingId(id);
    setVerifyNote(null);
    try {
      const token = await getToken();
      const r = await fetch(apiPath(`/signals/${id}/verify`), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json() as { verified?: boolean; reason?: string; error?: string; result?: { bestMovePercent: number; hitTarget: boolean } };
      if (!r.ok) { setVerifyNote({ id, text: d.error ?? 'Check failed.' }); return; }
      if (!d.verified) { setVerifyNote({ id, text: d.reason ?? 'Not verifiable.' }); return; }
      setVerifyNote({ id, text: `Best move: ${d.result?.bestMovePercent}%${d.result?.hitTarget ? ' — Green!' : ''}` });
      await fetchSignals();
    } catch { setVerifyNote({ id, text: 'Check failed.' }); }
    finally { setVerifyingId(null); }
  };

  const runScanNow = async () => {
    setRunningScan(true);
    setScanRunMessage('');
    try {
      const token = await getToken();
      const r = await fetch(apiPath('/admin/run-scan'), { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json().catch(() => ({})) as { message?: string; error?: string };
      setScanRunMessage(r.ok ? (d.message ?? 'Scan started.') : (d.error ?? 'Could not start the scan.'));
    } catch {
      setScanRunMessage('Could not start the scan.');
    } finally {
      setRunningScan(false);
    }
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

    <ScoreboardSummary stats={stats} />

    {/* Existing signals */}
    <div style={{marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
      <span className="eyebrow">Published signals ({signals.length})</span>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {scanRunMessage && <span className="muted tiny">{scanRunMessage}</span>}
        <button
          className="button button-outline"
          style={{fontSize:11,padding:'6px 14px'}}
          disabled={runningScan}
          onClick={() => void runScanNow()}
          data-testid="button-run-scan-now"
        >
          <Radio size={12}/> {runningScan ? 'Starting…' : 'Run scan now'}
        </button>
        <button
          className="button button-outline"
          style={{fontSize:11,padding:'6px 14px'}}
          onClick={() => void fetchSignals()}
          data-testid="button-refresh-signals"
        >
          <RotateCcw size={12}/> Refresh
        </button>
      </div>
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
                  {s.resultTag && s.resultTag !== 'Pending' && (
                    <span
                      className={`status-pill status-${s.resultTag === 'Green' ? 'active' : 'stopped'}`}
                      style={{ marginLeft: 6 }}
                      title={s.resultPercent != null ? `Best move: ${s.resultPercent}%` : undefined}
                    >
                      {s.resultTag}
                    </span>
                  )}
                </span>
                <span className="muted tiny">{formatDate(s)}</span>
                <span style={{display:'flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
                  <span style={{display:'flex',gap:6}}>
                    <button
                      className="button button-outline"
                      style={{fontSize:11,padding:'5px 12px'}}
                      onClick={() => startEdit(s)}
                      data-testid={`button-edit-signal-${s.id}`}
                    >
                      <Pencil size={11}/> Edit
                    </button>
                    {!s.isOption && (
                      <button
                        className="button button-outline"
                        style={{fontSize:11,padding:'5px 12px'}}
                        disabled={verifyingId === s.id}
                        onClick={() => void verifySignal(s.id)}
                        data-testid={`button-verify-signal-${s.id}`}
                      >
                        <Trophy size={11}/> {verifyingId === s.id ? 'Checking…' : 'Check'}
                      </button>
                    )}
                  </span>
                  {verifyNote && verifyNote.id === s.id && <span className="muted tiny">{verifyNote.text}</span>}
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
        <Route path="/app/learning">
          <RequireSubscription title="The academy is for members." description="Subscribe to unlock the full Learning tab — interactive lessons, candlestick mastery, indicators, trading history, and two gamified arcade modes.">
            <LearningPage />
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
