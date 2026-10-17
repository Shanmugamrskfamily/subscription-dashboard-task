const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** 79900 → "₹799". */
export const formatInr = (paise: number) => inr.format(paise / 100);

/** → "4 Nov 2026" in Indian time. */
export const formatDate = (date: Date | string) => dateFormat.format(new Date(date));
