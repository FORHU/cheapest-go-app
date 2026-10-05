/** "$85", "₩120,000" — whole units: a "from" price is a guide, and cents make it read like a quote. */
export function formatGreenFee(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
        return `${currency} ${Math.round(amount)}`;
    }
}

/** "₱5,318.00" — an amount someone is paying, so the minor units are shown. */
export function formatMoney(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}
