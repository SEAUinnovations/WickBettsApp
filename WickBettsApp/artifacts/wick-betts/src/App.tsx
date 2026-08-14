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
