// Provider seam for email/SMS OTP delivery. The app intentionally ships with
// no delivery adapter, so callers can never mistake a queued stub for a sent OTP.
export function createVerificationDeliveryService(provider) {
  return {
    isConfigured: () => typeof provider?.sendCode === 'function',
    async sendCode(destination, code) {
      if (typeof provider?.sendCode !== 'function') return { sent: false, configured: false };
      await provider.sendCode(destination, code);
      return { sent: true, configured: true };
    }
  };
}

export const emailVerificationDelivery = createVerificationDeliveryService();
export const phoneVerificationDelivery = createVerificationDeliveryService();
