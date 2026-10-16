import accessExpired from '../assets/illustrations/access-expired.webp';
import accountBlocked from '../assets/illustrations/account-blocked.webp';
import accountInactive from '../assets/illustrations/account-inactive.webp';
import brokenGear from '../assets/illustrations/broken-gear.webp';
import coinsGrowth from '../assets/illustrations/coins-growth.webp';
import crownBadge from '../assets/illustrations/crown-badge.webp';
import emptyBoard from '../assets/illustrations/empty-board.webp';
import emptyBox from '../assets/illustrations/empty-box.webp';
import limitReached from '../assets/illustrations/limit-reached.webp';
import lockedDoor from '../assets/illustrations/locked-door.webp';
import lostCompass from '../assets/illustrations/lost-compass.webp';
import noResults from '../assets/illustrations/no-results.webp';
import paymentFailed from '../assets/illustrations/payment-failed.webp';
import paymentSuccess from '../assets/illustrations/payment-success.webp';
import quietBell from '../assets/illustrations/quiet-bell.webp';
import renewalCalendar from '../assets/illustrations/renewal-calendar.webp';
import rocket from '../assets/illustrations/rocket.webp';
import unplugged from '../assets/illustrations/unplugged.webp';

/** The 3D illustration set: transparent WebP, so each works on light and dark. */
export const ILLUSTRATIONS = {
  accessExpired,
  accountBlocked,
  accountInactive,
  brokenGear,
  coinsGrowth,
  crownBadge,
  emptyBoard,
  emptyBox,
  limitReached,
  lockedDoor,
  lostCompass,
  noResults,
  paymentFailed,
  paymentSuccess,
  quietBell,
  renewalCalendar,
  rocket,
  unplugged,
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;
