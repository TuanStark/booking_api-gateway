/**
 * Map gateway URL (/payment/... or /payments/...) → payment-service path (/payments/...).
 */
export function toPaymentServicePath(originalUrl: string): string {
  const qIndex = originalUrl.indexOf('?');
  const pathname = qIndex >= 0 ? originalUrl.slice(0, qIndex) : originalUrl;
  const query = qIndex >= 0 ? originalUrl.slice(qIndex) : '';

  let suffix = '';
  if (pathname.startsWith('/payments/')) {
    suffix = pathname.slice('/payments'.length);
  } else if (pathname === '/payments') {
    suffix = '';
  } else if (pathname.startsWith('/payment/')) {
    suffix = pathname.slice('/payment'.length);
  } else if (pathname === '/payment') {
    suffix = '';
  } else {
    suffix = pathname;
  }

  return `/payments${suffix}${query}`;
}
