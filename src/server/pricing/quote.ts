/**
 * Pricing engine (pure). All amounts are integer halalas; rates are basis points (1% = 100 bps).
 * Rounding: half-up to the nearest halala, applied once per component.
 *   subtotal   = Σ item prices
 *   vat        = round((subtotal + travelFee) × vatBps / 10000)
 *   total      = subtotal + travelFee + vat
 *   commission = round(subtotal × commissionBps / 10000)   — platform's share of the service value
 *   providerNet = subtotal + travelFee − commission          — before payment-gateway fees (Phase 5)
 */
export interface QuoteInput {
  items: { priceHalalas: number }[];
  travelFeeHalalas: number;
  vatBps: number;
  commissionBps: number;
}

export interface Quote {
  subtotalHalalas: number;
  travelFeeHalalas: number;
  vatBps: number;
  vatHalalas: number;
  totalHalalas: number;
  commissionBps: number;
  commissionHalalas: number;
  providerNetHalalas: number;
}

const applyBps = (amount: number, bps: number) => Math.round((amount * bps) / 10_000);

export function computeQuote(input: QuoteInput): Quote {
  for (const n of [input.travelFeeHalalas, input.vatBps, input.commissionBps, ...input.items.map((i) => i.priceHalalas)]) {
    if (!Number.isInteger(n) || n < 0) throw new Error("quote inputs must be non-negative integers");
  }
  const subtotal = input.items.reduce((s, i) => s + i.priceHalalas, 0);
  const vat = applyBps(subtotal + input.travelFeeHalalas, input.vatBps);
  const commission = applyBps(subtotal, input.commissionBps);
  return {
    subtotalHalalas: subtotal,
    travelFeeHalalas: input.travelFeeHalalas,
    vatBps: input.vatBps,
    vatHalalas: vat,
    totalHalalas: subtotal + input.travelFeeHalalas + vat,
    commissionBps: input.commissionBps,
    commissionHalalas: commission,
    providerNetHalalas: subtotal + input.travelFeeHalalas - commission,
  };
}

export function formatSar(halalas: number, locale: "ar" | "en" = "ar"): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
  }).format(halalas / 100);
}
