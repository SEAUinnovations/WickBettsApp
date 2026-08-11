import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js"; // also registers passport strategies as side-effect
import stripeRouter from "./stripe.js";
import signalsRouter from "./signals.js";
import newsRouter from "./news.js";
import marketRouter from "./market.js";
import adminRouter from "./admin.js";
import communityRouter from "./community.js";

const router = Router();

router.use("/healthz", healthRouter);
router.use("/auth", authRouter);
router.use("/stripe", stripeRouter);
router.use("/signals", signalsRouter);
router.use("/news", newsRouter);
router.use("/market", marketRouter);
router.use("/admin", adminRouter);
router.use("/community", communityRouter);

export default router;
