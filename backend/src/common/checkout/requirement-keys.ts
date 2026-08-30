/**
 * The closed vocabulary of things checkout may ask a customer for.
 *
 * The frontend already enforces this list. Enforcing it again here is the point:
 * a requirement reaches the browser as data, read from `offers.checkout_requirements`,
 * and data is editable. If someone added a `PSN_PASSWORD` row to that column,
 * whether by mistake, by a bad migration or by a compromised admin path, an
 * allowlist on the client alone would not stop the server from serving it.
 *
 * Nothing here collects a credential, and nothing may be added that does. There
 * is no password, no 2FA code, no recovery code, no security answer, and no card
 * field. A field that cannot be expressed in this list is a field the storefront
 * cannot ask for, which is a structural guarantee rather than a policy.
 */

/** Mirrors `CheckoutFieldKey` in the frontend domain, member for member. */
export const CHECKOUT_FIELD_KEYS = [
  'EMAIL',
  'FULL_NAME',
  'PHONE',
  'REGION_CONFIRMATION',
  'PLATFORM_ACCOUNT_HANDLE',
  'GAME_PLAYER_ID',
  'PLATFORM_SELECTION',
  'SERVICE_NOTE',
  'TERMS_ACCEPTANCE',
] as const;

export type CheckoutFieldKey = (typeof CHECKOUT_FIELD_KEYS)[number];

/** Mirrors `CheckoutFieldControl`. A `password` control does not exist. */
export const CHECKOUT_FIELD_CONTROLS = [
  'text',
  'email',
  'tel',
  'textarea',
  'select',
  'checkbox',
] as const;

export type CheckoutFieldControl = (typeof CHECKOUT_FIELD_CONTROLS)[number];

const KEY_SET: ReadonlySet<string> = new Set(CHECKOUT_FIELD_KEYS);
const CONTROL_SET: ReadonlySet<string> = new Set(CHECKOUT_FIELD_CONTROLS);

/** How long each field's value may be. Bounds what a submission can carry. */
export const FIELD_MAX_LENGTH: Readonly<Record<CheckoutFieldKey, number>> = {
  EMAIL: 254,
  FULL_NAME: 80,
  PHONE: 20,
  REGION_CONFIRMATION: 8,
  PLATFORM_ACCOUNT_HANDLE: 64,
  GAME_PLAYER_ID: 64,
  PLATFORM_SELECTION: 40,
  SERVICE_NOTE: 500,
  TERMS_ACCEPTANCE: 8,
};

/** Fields whose value is a checkbox, so the answer is a boolean, not text. */
const BOOLEAN_KEYS: ReadonlySet<string> = new Set(['REGION_CONFIRMATION', 'TERMS_ACCEPTANCE']);

export function isCheckoutFieldKey(value: unknown): value is CheckoutFieldKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

export function isBooleanField(key: CheckoutFieldKey): boolean {
  return BOOLEAN_KEYS.has(key);
}

export interface LocalizedText {
  readonly he: string;
  readonly en?: string | null;
}

export interface CheckoutRequirement {
  readonly key: CheckoutFieldKey;
  readonly control: CheckoutFieldControl;
  readonly label: LocalizedText;
  readonly hint?: LocalizedText | null;
  readonly placeholder?: LocalizedText | null;
  readonly required: boolean;
  readonly maxLength?: number | null;
  readonly pattern?: string | null;
  readonly options?: readonly { readonly value: string; readonly label: LocalizedText }[] | null;
}

function localized(value: unknown): LocalizedText | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['he'] !== 'string') {
    return null;
  }
  return {
    he: record['he'],
    en: typeof record['en'] === 'string' ? record['en'] : null,
  };
}

/**
 * Turns whatever is stored in the database into requirements that are safe to
 * serve, discarding the rest.
 *
 * Dropping an unrecognised entry rather than raising is deliberate. A single
 * malformed row should narrow what the checkout asks for, never take the
 * storefront down; and a field that is silently absent cannot be filled in by a
 * customer, which is the safe direction to fail in.
 */
export function sanitizeRequirements(raw: unknown): CheckoutRequirement[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: CheckoutRequirement[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;

    const key = record['key'];
    if (!isCheckoutFieldKey(key) || seen.has(key)) {
      continue;
    }

    const control = record['control'];
    if (typeof control !== 'string' || !CONTROL_SET.has(control)) {
      continue;
    }

    const label = localized(record['label']);
    if (!label) {
      // A field with no label would render as an unexplained box.
      continue;
    }

    const options = Array.isArray(record['options'])
      ? record['options']
          .map((option) => {
            if (!option || typeof option !== 'object') {
              return null;
            }
            const optionRecord = option as Record<string, unknown>;
            const optionLabel = localized(optionRecord['label']);
            const value = optionRecord['value'];
            return typeof value === 'string' && optionLabel
              ? { value, label: optionLabel }
              : null;
          })
          .filter((option): option is { value: string; label: LocalizedText } => option !== null)
      : null;

    seen.add(key);
    result.push({
      key,
      control: control as CheckoutFieldControl,
      label,
      hint: localized(record['hint']),
      placeholder: localized(record['placeholder']),
      required: record['required'] === true,
      // The stored maximum is capped rather than trusted, so a widened row
      // cannot turn a note field into an unbounded upload.
      maxLength: Math.min(
        typeof record['maxLength'] === 'number' ? record['maxLength'] : FIELD_MAX_LENGTH[key],
        FIELD_MAX_LENGTH[key],
      ),
      pattern: typeof record['pattern'] === 'string' ? record['pattern'] : null,
      options: options && options.length > 0 ? options : null,
    });
  }

  return result;
}
