// Central DB + schema export for the api-server.
// TypeScript resolves @workspace/db via the project reference in tsconfig.json,
// so all types come from lib/db/dist after `tsc --build lib/db`.
export { db, pool } from "@workspace/db";

// Re-export the full schema surface so route files import from one place.
export {
  // Users
  usersTable,
  insertUserSchema,
  userRoleEnum,
  type InsertUser,
  type User,
  // Subscriptions
  subscriptionsTable,
  insertSubscriptionSchema,
  planEnum,
  subStatusEnum,
  type InsertSubscription,
  type Subscription,
  // Signals
  signalsTable,
  insertSignalSchema,
  marketEnum,
  directionEnum,
  signalStatusEnum,
  optionTypeEnum,
  signalStyleEnum,
  type InsertSignal,
  type Signal,
  // Community
  communityPostsTable,
  communityThreadEnum,
  insertCommunityPostSchema,
  type InsertCommunityPost,
  type CommunityPost,
  // Watchlists
  watchlistsTable,
  insertWatchlistSchema,
  type InsertWatchlist,
  type Watchlist,
  // News overrides
  newsOverridesTable,
  insertNewsOverrideSchema,
  type InsertNewsOverride,
  type NewsOverride,
  // Mentorship bookings
  mentorshipBookingsTable,
  mentorshipBookingStatusEnum,
  insertMentorshipBookingSchema,
  type InsertMentorshipBooking,
  type MentorshipBooking,
  // Trade reviews ("Review My Trade")
  tradeReviewsTable,
  tradeBiasEnum,
  tradeReviewVerdictEnum,
  insertTradeReviewSchema,
  type InsertTradeReview,
  type TradeReview,
  // Community post reactions
  communityPostReactionsTable,
  insertCommunityPostReactionSchema,
  type InsertCommunityPostReaction,
  type CommunityPostReaction,
  // Member-shared signals + follows
  communitySignalsTable,
  communitySignalStatusEnum,
  insertCommunitySignalSchema,
  type InsertCommunitySignal,
  type CommunitySignal,
  memberFollowsTable,
  insertMemberFollowSchema,
  type InsertMemberFollow,
  type MemberFollow,
} from "@workspace/db";
