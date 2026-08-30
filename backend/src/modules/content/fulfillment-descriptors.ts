/**
 * What each delivery method means, in the customer's words.
 *
 * These describe our own process rather than any row in the database, which is
 * why they are code and not data. They mirror the descriptors the mock backend
 * serves, so switching between mock and HTTP does not change what a customer is
 * told about delivery.
 *
 * The estimates are ranges and are deliberately not promises. Nothing here
 * claims instant delivery, and the in-game description states plainly that we
 * never ask for a password or a verification code.
 */
export interface FulfillmentDescriptor {
  readonly method: string;
  readonly label: { he: string; en: string };
  readonly description: { he: string; en: string };
  readonly etaMinutesMin?: number | null;
  readonly etaMinutesMax?: number | null;
  readonly automated: boolean;
  readonly requiresCustomerAction: boolean;
}

export const FULFILLMENT_DESCRIPTORS: readonly FulfillmentDescriptor[] = [
  {
    method: 'DIGITAL_CODE',
    label: { he: 'קוד דיגיטלי', en: 'Digital code' },
    description: {
      he: 'הקוד נשלח למייל ומוצג בדף ההזמנה מיד לאחר אישור התשלום.',
      en: 'The code is emailed to you and shown on the order page right after payment is approved.',
    },
    etaMinutesMin: 0,
    etaMinutesMax: 5,
    automated: true,
    requiresCustomerAction: false,
  },
  {
    method: 'AUTOMATED_API',
    label: { he: 'אספקה אוטומטית', en: 'Automated delivery' },
    description: {
      he: 'אספקה אוטומטית דרך ספק מקושר. שיטה זו אינה פעילה בשלב זה.',
      en: 'Automated delivery through a connected supplier. This method is not active yet.',
    },
    etaMinutesMin: null,
    etaMinutesMax: null,
    automated: true,
    requiresCustomerAction: false,
  },
  {
    method: 'MANUAL_REVIEW',
    label: { he: 'בבדיקה ידנית', en: 'Manual review' },
    description: {
      he: 'ההזמנה עוברת בדיקה אנושית קצרה לפני האספקה.',
      en: 'Your order goes through a short human review before delivery.',
    },
    etaMinutesMin: 10,
    etaMinutesMax: 120,
    automated: false,
    requiresCustomerAction: false,
  },
  {
    method: 'MANUAL_DELIVERY',
    label: { he: 'אספקה ידנית', en: 'Manual delivery' },
    description: {
      he: 'נציג שלנו מבצע את האספקה באופן ידני ומעדכן אתכם בדף ההזמנה.',
      en: 'A member of our team delivers this manually and updates you on the order page.',
    },
    etaMinutesMin: 5,
    etaMinutesMax: 30,
    automated: false,
    requiresCustomerAction: true,
  },
  {
    method: 'IN_GAME_SERVICE',
    label: { he: 'שירות בתוך המשחק', en: 'In-game service' },
    description: {
      he: 'השירות מתבצע בתוך המשחק בתיאום איתכם. לעולם לא נבקש סיסמה או קוד אימות.',
      en: 'Performed inside the game in coordination with you. We will never ask for a password or a verification code.',
    },
    etaMinutesMin: 30,
    etaMinutesMax: 240,
    automated: false,
    requiresCustomerAction: true,
  },
  {
    method: 'NOT_SUPPORTED',
    label: { he: 'לא זמין', en: 'Not available' },
    description: {
      he: 'המוצר מוצג לצורכי מידע בלבד ואינו ניתן לרכישה כרגע.',
      en: 'Listed for information only and cannot be purchased at the moment.',
    },
    etaMinutesMin: null,
    etaMinutesMax: null,
    automated: false,
    requiresCustomerAction: false,
  },
];
