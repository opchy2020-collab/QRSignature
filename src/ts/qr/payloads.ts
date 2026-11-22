// What goes inside a QR code, for each kind of code, plus plain-language validation.
// Everything here is plain functions with no screen code, so it is easy to test.

export type QrType =
  | "url"
  | "text"
  | "wifi"
  | "contact"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "social";

export type TypeGroup = "web" | "message" | "contact" | "other";

export type IconName =
  | "link"
  | "text"
  | "wifi"
  | "contact"
  | "mail"
  | "phone"
  | "sms"
  | "whatsapp"
  | "social";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  id: string;
  label: string;
  kind: "text" | "url" | "email" | "tel" | "textarea" | "password" | "select" | "checkbox";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: FieldOption[];
  maxLength?: number;
  autocomplete?: string;
  /** Show this field only when another field has one of these values. */
  showWhen?: { field: string; notEqual?: string; equals?: string };
}

export interface TypeDef {
  id: QrType;
  label: string;
  description: string;
  group: TypeGroup;
  icon: IconName;
  /** A harmless example used for the sample code before the visitor types anything. */
  example: Record<string, string>;
  fields: FieldDef[];
}

export type Values = Record<string, string>;

export type BuildResult =
  | {
      ok: true;
      /** The exact text that goes inside the QR code. */
      text: string;
      /** A short description for screen readers and file names. */
      summary: string;
      /** A web link people can be sent to, if the code is about one. */
      shareUrl?: string;
    }
  | {
      ok: false;
      /** True when nothing has been typed yet (so no error should be shown). */
      empty: boolean;
      /** Plain-language errors, keyed by field id. */
      errors: Record<string, string>;
    };

// ---- Small helpers ---------------------------------------------------------------------------

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Turns a phone number into digits with an optional leading +. Returns "" when it is not plausible. */
export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return "";
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 15) return "";
  return (hasPlus ? "+" : "") + digits;
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function isEmail(input: string): boolean {
  const text = input.trim();
  if (text.length > 254 || !EMAIL_PATTERN.test(text)) return false;
  const [local = "", domain = ""] = text.split("@");
  // No empty parts such as "a@b..co" or "a.@b.co".
  return !text.includes("..") && !local.startsWith(".") && !local.endsWith(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export const MAX_URL_LENGTH = 2000;
export const MAX_TEXT_BYTES = 1000;

/**
 * Checks a web link. Only http and https are accepted: other kinds (javascript:, data:,
 * file: ...) can be used to attack the person who scans the code.
 */
export function normalizeUrl(
  input: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Enter the web address you want to share." };
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: "This link is too long. Use a shorter link (under 2,000 characters)." };
  }
  if (/\s/.test(raw)) return { ok: false, error: "A web address cannot contain spaces." };

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  let candidate = raw;
  if (schemeMatch) {
    const scheme = (schemeMatch[1] as string).toLowerCase();
    const looksLikeHostAndPort = /^[^/:]+:\d+(\/|$)/.test(raw);
    if (scheme !== "http" && scheme !== "https" && !looksLikeHostAndPort) {
      return { ok: false, error: "Only web links that start with http:// or https:// are allowed." };
    }
    if (looksLikeHostAndPort) candidate = `https://${raw}`;
  } else if (raw.startsWith("//")) {
    candidate = `https:${raw}`;
  } else {
    candidate = `https://${raw}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "That does not look like a web address. Try something like example.com." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only web links that start with http:// or https:// are allowed." };
  }
  const host = parsed.hostname;
  if (!host.includes(".") && host !== "localhost") {
    return { ok: false, error: "That does not look like a web address. Try something like example.com." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Links with a user name or password in them are not allowed." };
  }
  // The scheme is case-insensitive in a link, but some scanners only recognise it in lower case.
  return { ok: true, url: candidate.replace(/^https?:/i, (scheme) => scheme.toLowerCase()) };
}

// ---- Escaping for the special formats --------------------------------------------------------

/** Wi-Fi codes use backslash escapes for these characters. */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/** vCard text values escape backslash, semicolon, comma and line breaks. */
export function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// ---- Social profiles -------------------------------------------------------------------------

export type SocialPlatform = "instagram" | "facebook" | "x" | "linkedin";

interface SocialInfo {
  label: string;
  host: string;
  pathPrefix: string;
  hostMatches: RegExp;
  handle: RegExp;
  handleHelp: string;
}

export const SOCIAL: Record<SocialPlatform, SocialInfo> = {
  instagram: {
    label: "Instagram",
    host: "www.instagram.com",
    pathPrefix: "",
    hostMatches: /(^|\.)instagram\.com$/i,
    handle: /^[A-Za-z0-9._]{1,30}$/,
    handleHelp: "Instagram names use letters, numbers, dots and underscores (up to 30).",
  },
  facebook: {
    label: "Facebook",
    host: "www.facebook.com",
    pathPrefix: "",
    hostMatches: /(^|\.)facebook\.com$/i,
    handle: /^[A-Za-z0-9.]{5,50}$/,
    handleHelp: "Facebook page names use letters, numbers and dots (5 to 50).",
  },
  x: {
    label: "X",
    host: "x.com",
    pathPrefix: "",
    hostMatches: /(^|\.)(x|twitter)\.com$/i,
    handle: /^[A-Za-z0-9_]{1,15}$/,
    handleHelp: "X names use letters, numbers and underscores (up to 15).",
  },
  linkedin: {
    label: "LinkedIn",
    host: "www.linkedin.com",
    pathPrefix: "in/",
    hostMatches: /(^|\.)linkedin\.com$/i,
    handle: /^[A-Za-z0-9_%-]{3,100}$/,
    handleHelp: "LinkedIn profile names use letters, numbers and dashes (3 to 100).",
  },
};

export function isSocialPlatform(value: string): value is SocialPlatform {
  return value === "instagram" || value === "facebook" || value === "x" || value === "linkedin";
}

function buildSocial(values: Values): BuildResult {
  const platformValue = clean(values.platform) || "instagram";
  const platform: SocialPlatform = isSocialPlatform(platformValue) ? platformValue : "instagram";
  const info = SOCIAL[platform];
  const raw = clean(values.handle);
  if (raw === "") return { ok: false, empty: true, errors: { handle: "Enter the profile name or link." } };

  let handle = raw;
  if (/^https?:\/\//i.test(raw) || raw.includes("/")) {
    const asUrl = normalizeUrl(raw);
    if (!asUrl.ok) return { ok: false, empty: false, errors: { handle: asUrl.error } };
    const parsed = new URL(asUrl.url);
    if (!info.hostMatches.test(parsed.hostname)) {
      return {
        ok: false,
        empty: false,
        errors: { handle: `That link is not a ${info.label} link. Paste a ${info.label} link or just the profile name.` },
      };
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = platform === "linkedin" ? parts[parts[0] === "in" ? 1 : 0] : parts[0];
    handle = last ?? "";
  }
  handle = handle.replace(/^@/, "");
  if (!info.handle.test(handle)) {
    return { ok: false, empty: false, errors: { handle: info.handleHelp } };
  }
  const url = `https://${info.host}/${info.pathPrefix}${handle}`;
  return { ok: true, text: url, summary: `${info.label} profile ${handle}`, shareUrl: url };
}

// ---- The type table (also drives the form fields on the Create page) -------------------------

export const SECURITY_OPTIONS: FieldOption[] = [
  { value: "WPA", label: "WPA / WPA2 / WPA3 (most networks)" },
  { value: "WEP", label: "WEP (old)" },
  { value: "nopass", label: "No password" },
];

export const TYPES: TypeDef[] = [
  {
    id: "url",
    label: "Website link",
    description: "Open a web page.",
    group: "web",
    icon: "link",
    example: { url: "https://example.com" },
    fields: [
      {
        id: "url",
        label: "Web address",
        kind: "url",
        placeholder: "example.com",
        hint: "You can leave out https://. We add it for you.",
        required: true,
        autocomplete: "url",
      },
    ],
  },
  {
    id: "text",
    label: "Plain text",
    description: "Show a short message.",
    group: "other",
    icon: "text",
    example: { text: "Hello from QR Signature" },
    fields: [
      {
        id: "text",
        label: "Your text",
        kind: "textarea",
        placeholder: "Type the message people will see",
        required: true,
        maxLength: 1000,
      },
    ],
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    description: "Let guests join your network.",
    group: "other",
    icon: "wifi",
    example: { ssid: "Guest network", security: "WPA", password: "sample-password", hidden: "" },
    fields: [
      { id: "ssid", label: "Network name", kind: "text", placeholder: "My home Wi-Fi", required: true, maxLength: 32, autocomplete: "off" },
      { id: "security", label: "Security", kind: "select", options: SECURITY_OPTIONS },
      {
        id: "password",
        label: "Password",
        kind: "password",
        required: true,
        maxLength: 63,
        autocomplete: "off",
        showWhen: { field: "security", notEqual: "nopass" },
      },
      { id: "hidden", label: "This network is hidden", kind: "checkbox" },
    ],
  },
  {
    id: "contact",
    label: "Contact card",
    description: "Save a person in the phone's contacts.",
    group: "contact",
    icon: "contact",
    example: { firstName: "Alex", lastName: "Sample", organization: "Sample Co", title: "Designer", phone: "+1 555 010 0000", email: "alex@example.com", website: "example.com", address: "" },
    fields: [
      { id: "firstName", label: "First name", kind: "text", maxLength: 60, autocomplete: "given-name" },
      { id: "lastName", label: "Last name", kind: "text", maxLength: 60, autocomplete: "family-name" },
      { id: "organization", label: "Company", kind: "text", maxLength: 100, autocomplete: "organization" },
      { id: "title", label: "Job title", kind: "text", maxLength: 100, autocomplete: "organization-title" },
      { id: "phone", label: "Phone", kind: "tel", placeholder: "+1 555 010 0000", autocomplete: "tel" },
      { id: "email", label: "Email", kind: "email", autocomplete: "email" },
      { id: "website", label: "Website", kind: "url", placeholder: "example.com", autocomplete: "url" },
      { id: "address", label: "Address", kind: "text", maxLength: 200, autocomplete: "street-address" },
    ],
  },
  {
    id: "email",
    label: "Email",
    description: "Start a new email.",
    group: "message",
    icon: "mail",
    example: { to: "hello@example.com", subject: "Hello", body: "" },
    fields: [
      { id: "to", label: "Send to", kind: "email", placeholder: "name@example.com", required: true, autocomplete: "email" },
      { id: "subject", label: "Subject", kind: "text", maxLength: 150 },
      { id: "body", label: "Message", kind: "textarea", maxLength: 500 },
    ],
  },
  {
    id: "phone",
    label: "Phone call",
    description: "Start a call to a number.",
    group: "message",
    icon: "phone",
    example: { phone: "+1 555 010 0000" },
    fields: [
      { id: "phone", label: "Phone number", kind: "tel", placeholder: "+1 555 010 0000", required: true, hint: "Include the country code for people abroad.", autocomplete: "tel" },
    ],
  },
  {
    id: "sms",
    label: "Text message",
    description: "Start an SMS.",
    group: "message",
    icon: "sms",
    example: { phone: "+1 555 010 0000", message: "Hi!" },
    fields: [
      { id: "phone", label: "Phone number", kind: "tel", placeholder: "+1 555 010 0000", required: true, autocomplete: "tel" },
      { id: "message", label: "Message (optional)", kind: "textarea", maxLength: 300 },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp chat",
    description: "Open a WhatsApp chat.",
    group: "message",
    icon: "whatsapp",
    example: { phone: "+1 555 010 0000", message: "Hi!" },
    fields: [
      { id: "phone", label: "WhatsApp number", kind: "tel", placeholder: "+1 555 010 0000", required: true, hint: "Use the full number with the country code.", autocomplete: "tel" },
      { id: "message", label: "First message (optional)", kind: "textarea", maxLength: 300 },
    ],
  },
  {
    id: "social",
    label: "Social profile",
    description: "Open a profile page.",
    group: "web",
    icon: "social",
    example: { platform: "instagram", handle: "example" },
    fields: [
      {
        id: "platform",
        label: "Platform",
        kind: "select",
        options: [
          { value: "instagram", label: "Instagram" },
          { value: "facebook", label: "Facebook" },
          { value: "x", label: "X" },
          { value: "linkedin", label: "LinkedIn" },
        ],
      },
      { id: "handle", label: "Profile name or link", kind: "text", placeholder: "@yourname", required: true, autocomplete: "off" },
    ],
  },
];

export function getType(id: string): TypeDef {
  return TYPES.find((t) => t.id === id) ?? (TYPES[0] as TypeDef);
}

export function isQrType(value: string): value is QrType {
  return TYPES.some((t) => t.id === value);
}

/** Starting values for a type's form (selects get their first option). */
export function defaultValues(type: QrType): Values {
  const out: Values = {};
  for (const field of getType(type).fields) {
    out[field.id] = field.kind === "select" ? (field.options?.[0]?.value ?? "") : "";
  }
  return out;
}

// ---- The builder -----------------------------------------------------------------------------

function fail(errors: Record<string, string>, empty = false): BuildResult {
  return { ok: false, empty, errors };
}

function tooLong(text: string): string | null {
  return byteLength(text) > MAX_TEXT_BYTES
    ? "This is too long for one QR code. Shorten it to about 1,000 characters."
    : null;
}

/**
 * Builds the text for a QR code from what the visitor typed.
 * If something is wrong it returns plain-language errors for each field.
 */
export function buildPayload(type: QrType, values: Values): BuildResult {
  switch (type) {
    case "url": {
      const raw = clean(values.url);
      if (raw === "") return fail({ url: "Enter the web address you want to share." }, true);
      const result = normalizeUrl(raw);
      if (!result.ok) return fail({ url: result.error });
      const host = new URL(result.url).hostname.replace(/^www\./, "");
      return { ok: true, text: result.url, summary: `Website link to ${host}`, shareUrl: result.url };
    }

    case "text": {
      const text = (values.text ?? "").replace(/\r\n/g, "\n");
      if (text.trim() === "") return fail({ text: "Type the text you want to turn into a code." }, true);
      const long = tooLong(text);
      if (long) return fail({ text: long });
      return { ok: true, text, summary: "Plain text" };
    }

    case "wifi": {
      const ssid = (values.ssid ?? "").trim();
      const security = clean(values.security) || "WPA";
      const password = values.password ?? "";
      const errors: Record<string, string> = {};
      if (ssid === "") errors.ssid = "Enter the network name exactly as it appears on the phone.";
      else if (byteLength(ssid) > 32) errors.ssid = "A network name can be at most 32 characters.";
      if (!["WPA", "WEP", "nopass"].includes(security)) errors.security = "Choose a security type from the list.";
      if (security !== "nopass") {
        if (password === "") errors.password = "Enter the Wi-Fi password.";
        else if (security === "WPA" && (password.length < 8 || password.length > 63)) {
          errors.password = "WPA passwords have 8 to 63 characters.";
        } else if (security === "WEP" && password.length < 5) {
          errors.password = "WEP passwords have at least 5 characters.";
        }
      }
      if (Object.keys(errors).length > 0) {
        const empty = ssid === "" && password === "";
        return fail(errors, empty);
      }
      const hidden = values.hidden === "true" ? "H:true;" : "";
      const text =
        security === "nopass"
          ? `WIFI:T:nopass;S:${escapeWifi(ssid)};${hidden};`
          : `WIFI:T:${security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};${hidden};`;
      return { ok: true, text, summary: `Wi-Fi network ${ssid}` };
    }

    case "contact": {
      const first = clean(values.firstName);
      const last = clean(values.lastName);
      const organization = clean(values.organization);
      const title = clean(values.title);
      const phoneRaw = clean(values.phone);
      const emailRaw = clean(values.email);
      const websiteRaw = clean(values.website);
      const address = clean(values.address);
      const anything = [first, last, organization, title, phoneRaw, emailRaw, websiteRaw, address].some((v) => v !== "");
      if (!anything) return fail({ firstName: "Enter at least a first or last name." }, true);

      const errors: Record<string, string> = {};
      if (first === "" && last === "") errors.firstName = "Enter at least a first or last name.";
      let phone = "";
      if (phoneRaw !== "") {
        phone = normalizePhone(phoneRaw);
        if (!phone) errors.phone = "Enter a phone number with 5 to 15 digits. Use + for the country code.";
      }
      if (emailRaw !== "" && !isEmail(emailRaw)) errors.email = "That email address does not look right. Check it for typing mistakes.";
      let website = "";
      if (websiteRaw !== "") {
        const w = normalizeUrl(websiteRaw);
        if (!w.ok) errors.website = w.error;
        else website = w.url;
      }
      if (Object.keys(errors).length > 0) return fail(errors);

      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
        `FN:${escapeVCard([first, last].filter(Boolean).join(" "))}`,
      ];
      if (organization) lines.push(`ORG:${escapeVCard(organization)}`);
      if (title) lines.push(`TITLE:${escapeVCard(title)}`);
      if (phone) lines.push(`TEL;TYPE=CELL:${phone}`);
      if (emailRaw) lines.push(`EMAIL:${escapeVCard(emailRaw)}`);
      if (website) lines.push(`URL:${website}`);
      if (address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(address)};;;;`);
      lines.push("END:VCARD");
      const text = lines.join("\r\n");
      const long = tooLong(text);
      if (long) return fail({ firstName: "There is too much text in this card. Remove some details." });
      return { ok: true, text, summary: `Contact card for ${[first, last].filter(Boolean).join(" ")}` };
    }

    case "email": {
      const to = clean(values.to);
      const subject = clean(values.subject);
      const body = (values.body ?? "").replace(/\r\n/g, "\n").trim();
      if (to === "" && subject === "" && body === "") return fail({ to: "Enter the email address to send to." }, true);
      if (!isEmail(to)) return fail({ to: to === "" ? "Enter the email address to send to." : "That email address does not look right. Check it for typing mistakes." });
      const parts: string[] = [];
      if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
      if (body) parts.push(`body=${encodeURIComponent(body)}`);
      const text = `mailto:${to}${parts.length ? `?${parts.join("&")}` : ""}`;
      const long = tooLong(text);
      if (long) return fail({ body: "The message is too long for one QR code. Shorten it." });
      return { ok: true, text, summary: `Email to ${to}` };
    }

    case "phone": {
      const raw = clean(values.phone);
      if (raw === "") return fail({ phone: "Enter the phone number to call." }, true);
      const phone = normalizePhone(raw);
      if (!phone) return fail({ phone: "Enter a phone number with 5 to 15 digits. Use + for the country code." });
      return { ok: true, text: `tel:${phone}`, summary: `Phone call to ${phone}` };
    }

    case "sms": {
      const raw = clean(values.phone);
      const message = (values.message ?? "").replace(/\r\n/g, "\n").trim();
      if (raw === "" && message === "") return fail({ phone: "Enter the phone number to text." }, true);
      const phone = normalizePhone(raw);
      if (!phone) return fail({ phone: raw === "" ? "Enter the phone number to text." : "Enter a phone number with 5 to 15 digits. Use + for the country code." });
      const text = message ? `sms:${phone}?body=${encodeURIComponent(message)}` : `sms:${phone}`;
      return { ok: true, text, summary: `Text message to ${phone}` };
    }

    case "whatsapp": {
      const raw = clean(values.phone);
      const message = (values.message ?? "").replace(/\r\n/g, "\n").trim();
      if (raw === "" && message === "") return fail({ phone: "Enter the WhatsApp number." }, true);
      const normalized = normalizePhone(raw);
      // wa.me wants the country code first, with no + and no leading zeros. "00" is the international prefix.
      // A single leading 0 is a national number with no country code, and we cannot guess the country.
      let phone = normalized.startsWith("+") ? normalized.slice(1) : normalized.startsWith("00") ? normalized.slice(2) : normalized;
      if (normalized !== "" && phone.startsWith("0")) {
        return fail({ phone: "Start with the country code, for example +44 for the United Kingdom, not with 0." });
      }
      if (phone.length < 5) phone = "";
      if (!phone) return fail({ phone: raw === "" ? "Enter the WhatsApp number." : "Enter the full number with the country code, 5 to 15 digits." });
      const url = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
      return { ok: true, text: url, summary: `WhatsApp chat with ${phone}`, shareUrl: url };
    }

    case "social":
      return buildSocial(values);
  }
}

/** A short word for file names, such as "website" or "wifi". */
export function fileLabel(type: QrType): string {
  switch (type) {
    case "url": return "website";
    case "text": return "text";
    case "wifi": return "wifi";
    case "contact": return "contact";
    case "email": return "email";
    case "phone": return "phone";
    case "sms": return "sms";
    case "whatsapp": return "whatsapp";
    case "social": return "profile";
  }
}
