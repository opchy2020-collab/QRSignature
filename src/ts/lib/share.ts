// Links that open each social network's own share screen.
// None of these send anything by themselves: they open the network's page in a new tab.

export interface ShareInput {
  /** A web address to share, if there is one. */
  url?: string;
  /** A short sentence to go with it. */
  text: string;
}

export type ShareNetwork = "facebook" | "whatsapp" | "linkedin" | "x";

export interface ShareLink {
  network: ShareNetwork;
  label: string;
  /** Null when this network cannot share what we have (for example Facebook needs a web address). */
  href: string | null;
  /** Plain-language reason when href is null. */
  unavailable?: string;
}

const enc = encodeURIComponent;

export function buildShareLinks(input: ShareInput): ShareLink[] {
  const { url, text } = input;
  const needsUrl = "This needs a web address. Make a website-link code, or download the image and post it.";
  const textWithUrl = url ? `${text} ${url}` : text;
  return [
    {
      network: "facebook",
      label: "Facebook",
      href: url ? `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` : null,
      unavailable: url ? undefined : needsUrl,
    },
    {
      network: "whatsapp",
      label: "WhatsApp",
      href: `https://wa.me/?text=${enc(textWithUrl)}`,
    },
    {
      network: "linkedin",
      label: "LinkedIn",
      href: url ? `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` : null,
      unavailable: url ? undefined : needsUrl,
    },
    {
      network: "x",
      label: "X",
      href: `https://x.com/intent/post?text=${enc(text)}${url ? `&url=${enc(url)}` : ""}`,
    },
  ];
}

/** The address of this site if it is on the web (not when opened as a file on a computer). */
export function siteUrl(loc: Pick<Location, "protocol" | "origin"> = window.location): string | undefined {
  return loc.protocol === "http:" || loc.protocol === "https:" ? `${loc.origin}/` : undefined;
}
