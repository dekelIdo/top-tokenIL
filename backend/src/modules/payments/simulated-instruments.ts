/**
 * The scenarios a tester can pick in the payment simulation.
 *
 * These mirror the tokens the frontend simulator offers, so behaviour does not
 * change when the app moves from mock mode to the real backend. Every label
 * says plainly that nothing is charged.
 */
export const SIMULATED_INSTRUMENTS = [
  {
    token: 'sim_success',
    label: { he: 'תשלום מאושר', en: 'Approved payment' },
    description: {
      he: 'הסימולציה מחזירה אישור וההזמנה עוברת לאספקה.',
      en: 'The simulation approves and the order moves to fulfillment.',
    },
    expectedStatus: 'SUCCEEDED',
  },
  {
    token: 'sim_declined',
    label: { he: 'תשלום נדחה', en: 'Declined payment' },
    description: {
      he: 'הסימולציה מחזירה סירוב מצד המנפיק.',
      en: 'The simulation returns an issuer decline.',
    },
    expectedStatus: 'FAILED',
  },
  {
    token: 'sim_cancelled',
    label: { he: 'ביטול על ידי הלקוח', en: 'Cancelled by customer' },
    description: {
      he: 'הלקוח נוטש את דף הספק והתשלום מבוטל.',
      en: 'The customer abandons the provider page and the payment is cancelled.',
    },
    expectedStatus: 'CANCELLED',
  },
  {
    token: 'sim_error',
    label: { he: 'שגיאת תקשורת', en: 'Gateway error' },
    description: {
      he: 'הספק מחזיר שגיאה, וניתן לנסות שוב.',
      en: 'The gateway errors out, and the payment can be retried.',
    },
    expectedStatus: 'FAILED',
  },
  {
    token: 'sim_timeout',
    label: { he: 'פסק זמן (איטי)', en: 'Timeout (slow)' },
    description: {
      he: 'התשלום נתקע במצב עיבוד, לבדיקת המצב הממתין.',
      en: 'The payment hangs in processing, which exercises the pending state.',
    },
    expectedStatus: 'PROCESSING',
  },
];
