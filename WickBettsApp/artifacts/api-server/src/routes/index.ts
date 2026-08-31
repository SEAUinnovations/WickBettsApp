import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js"; // also registers passport strategies as side-effect
import stripeRouter from "./stripe.js";
import signalsRouter from "./signals.js";
import newsRouter from "./news.js";
import marketRouter from "./market.js";
import adminRouter from "./admin.js";
import communityRouter from "./community.js";
import watchlistRouter from "./watchlist.js";
import mentorshipRouter from "./mentorship.js";
import tradeReviewsRouter from "./tradeReviews.js";
import supportRouter from "./support.js";
import referralsRouter from "./referrals.js";
import notificationsRouter from "./notifications.js";
import "../services/signalScanner.js"; // self-starting scheduler(s), side-effect import only — swing/LEAPS (2-day) + day-trade (daily)
import "../services/emailDigestScheduler.js"; // self-starting weekly ops digest, side-effect import only
import "../services/referralRewardScheduler.js"; // self-starting referral credit issuance, side-effect import only

const router = Router();

router.use("/healthz", healthRouter);
router.use("/auth", authRouter);
router.use("/stripe", stripeRouter);
router.use("/signals", signalsRouter);
router.use("/news", newsRouter);
router.use("/market", marketRouter);
router.use("/admin", adminRouter);
router.use("/community", communityRouter);
router.use("/watchlist", watchlistRouter);
router.use("/mentorship", mentorshipRouter);
router.use("/trade-reviews", tradeReviewsRouter);
router.use("/support", supportRouter);
router.use("/referrals", referralsRouter);
router.use("/notifications", notificationsRouter);

export default router;
