import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, byteLength, defaultValues, escapeWifi, fileLabel, getType, isEmail, isQrType, MAX_TEXT_BYTES, normalizePhone, normalizeUrl, TYPES } from "../src/ts/qr/payloads";

const ok = (type: Parameters<typeof buildPayload>[0], values: Record<string, string>) => {
  const r = buildPayload(type, values);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<typeof r, { ok: true }>;
};
const bad = (type: Parameters<typeof buildPayload>[0], values: Record<string, string>) => {
  const r = buildPayload(type, values);
  assert.equal(r.ok, false, `expected a problem for ${JSON.stringify(values)}`);
  return r as Extract<typeof r, { ok: false }>;
};

test("there are nine types and each example makes a valid code", () => {
  assert.equal(TYPES.length, 9);
  for (const t of TYPES) {
    const r = buildPayload(t.id, t.example);
    assert.equal(r.ok, true, `${t.id} example`);
    assert.ok(isQrType(t.id));
    assert.equal(getType(t.id).id, t.id);
    assert.ok(fileLabel(t.id).length > 0);
  }
  assert.equal(isQrType("nonsense"), false);
});

test("empty forms are 'empty', not 'wrong'", () => {
  for (const t of TYPES) {
    const r = buildPayload(t.id, defaultValues(t.id));
    assert.equal(r.ok, false, t.id);
    if (!r.ok) assert.equal(r.empty, true, `${t.id} should be empty`);
  }
});

test("website links: https is added, unsafe schemes are refused", () => {
  assert.equal(ok("url", { url: "example.com/menu" }).text, "https://example.com/menu");
  assert.equal(ok("url", { url: "http://example.com" }).text, "http://example.com");
  assert.equal(ok("url", { url: "HTTPS://Example.com/Path?x=1#y" }).text.slice(0, 8), "https://", "scheme is lower case");
  assert.equal(ok("url", { url: "//example.com" }).text, "https://example.com");
  for (const evil of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://x.com", "vbscript:x", "mailto:a@b.co", "blob:https://x.com/1"]) {
    assert.equal(normalizeUrl(evil).ok, false, evil);
  }
});

test("website links: other mistakes get plain messages", () => {
  const spaces = normalizeUrl("exa mple.com");
  assert.ok(!spaces.ok && /spaces/.test(spaces.error));
  assert.equal(normalizeUrl("example").ok, false);
  assert.equal(normalizeUrl("https://").ok, false);
  assert.equal(normalizeUrl("http://user:pw@example.com").ok, false);
  assert.equal(normalizeUrl("https://example.com/" + "a".repeat(2100)).ok, false);
  assert.equal(normalizeUrl("example.com:8080/x").ok, true, "host and port");
});

test("Wi-Fi: special characters are escaped", () => {
  assert.equal(escapeWifi('a;b,c:d\\e"f'), 'a\\;b\\,c\\:d\\\\e\\"f');
  const r = ok("wifi", { ssid: "Cafe;Guest", security: "WPA", password: "pa:ss;12345", hidden: "" });
  assert.equal(r.text, "WIFI:T:WPA;S:Cafe\\;Guest;P:pa\\:ss\\;12345;;");
});

test("Wi-Fi: open, hidden and checks", () => {
  assert.equal(ok("wifi", { ssid: "Cafe", security: "nopass", password: "ignored", hidden: "" }).text, "WIFI:T:nopass;S:Cafe;;");
  assert.equal(ok("wifi", { ssid: "Cafe", security: "WPA", password: "12345678", hidden: "true" }).text, "WIFI:T:WPA;S:Cafe;P:12345678;H:true;;");
  assert.ok(bad("wifi", { ssid: "Cafe", security: "WPA", password: "short", hidden: "" }).errors.password);
  assert.ok(bad("wifi", { ssid: "Cafe", security: "WPA", password: "", hidden: "" }).errors.password);
  assert.ok(bad("wifi", { ssid: "x".repeat(33), security: "WPA", password: "12345678", hidden: "" }).errors.ssid);
  assert.ok(bad("wifi", { ssid: "", security: "WPA", password: "12345678", hidden: "" }).errors.ssid);
});

test("contact card: vCard 3.0 with CRLF, escaped values", () => {
  const r = ok("contact", { firstName: "Ada", lastName: "Love;lace, Jr", organization: "Eng, Co", phone: "+1 555 010 0000", email: "ada@example.com", website: "example.com", address: "1 Main St; Town" });
  const lines = r.text.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCARD");
  assert.equal(lines[1], "VERSION:3.0");
  assert.equal(lines[lines.length - 1], "END:VCARD");
  assert.ok(r.text.includes("N:Love\\;lace\\, Jr;Ada;;;"));
  assert.ok(r.text.includes("TEL;TYPE=CELL:+15550100000"));
  assert.ok(r.text.includes("URL:https://example.com"));
  assert.ok(!/(^|[^\r])\n/.test(r.text), "no bare line feeds");
  assert.ok(bad("contact", { firstName: "A", email: "nope" }).errors.email);
  assert.ok(bad("contact", { organization: "Only a company" }).errors.firstName);
});

test("a name cannot smuggle extra vCard lines", () => {
  const r = ok("contact", { firstName: "Ada\r\nTEL:+999", lastName: "L" });
  assert.equal(r.text.split("\r\n").filter((l) => l.startsWith("TEL")).length, 0);
});

test("email, phone, SMS, WhatsApp", () => {
  assert.equal(ok("email", { to: "a@b.co", subject: "Hi & bye", body: "Line1\nLine2 100%" }).text, "mailto:a@b.co?subject=Hi%20%26%20bye&body=Line1%0ALine2%20100%25");
  assert.equal(ok("email", { to: "a@b.co", subject: "", body: "" }).text, "mailto:a@b.co");
  assert.equal(ok("phone", { phone: "+1 (555) 010-0000" }).text, "tel:+15550100000");
  assert.ok(bad("phone", { phone: "call me" }).errors.phone);
  assert.ok(bad("phone", { phone: "12" }).errors.phone);
  assert.equal(ok("sms", { phone: "+15550100000", message: "Hi & you? 100%" }).text, "sms:+15550100000?body=Hi%20%26%20you%3F%20100%25");
  assert.equal(ok("sms", { phone: "+15550100000", message: "" }).text, "sms:+15550100000");
  assert.equal(ok("whatsapp", { phone: "+1 555 010 0000", message: "Hi there" }).text, "https://wa.me/15550100000?text=Hi%20there");
});

test("WhatsApp: country code rules", () => {
  assert.equal(ok("whatsapp", { phone: "0044 20 7946 0000", message: "" }).text, "https://wa.me/442079460000", "00 prefix is dropped");
  assert.ok(bad("whatsapp", { phone: "07911 123456", message: "" }).errors.phone, "a national number with no country code is refused");
});

test("email addresses", () => {
  for (const good of ["a@b.co", "a+tag@sub.example.org", "first.last@example.com"]) assert.equal(isEmail(good), true, good);
  for (const no of ["a@b", "a b@c.co", "a@b..co", "@b.co", "a@b.c", "a.@b.co", "a@.b.co", "a@b.co.", "a@b.co\nBcc:x@y.zz", "<a@b.co>"]) assert.equal(isEmail(no), false, JSON.stringify(no));
});

test("phone numbers", () => {
  assert.equal(normalizePhone("+1 (555) 010-0000"), "+15550100000");
  assert.equal(normalizePhone("555.010.0000"), "5550100000");
  assert.equal(normalizePhone("abc"), "");
  assert.equal(normalizePhone("1234"), "");
  assert.equal(normalizePhone("1".repeat(16)), "");
});

test("social profiles", () => {
  assert.equal(ok("social", { platform: "instagram", handle: "@example" }).text, "https://www.instagram.com/example");
  assert.equal(ok("social", { platform: "instagram", handle: "https://instagram.com/example" }).text, "https://www.instagram.com/example");
  assert.equal(ok("social", { platform: "facebook", handle: "example.page" }).text, "https://www.facebook.com/example.page");
  assert.equal(ok("social", { platform: "x", handle: "@ex_ample" }).text, "https://x.com/ex_ample");
  assert.equal(ok("social", { platform: "linkedin", handle: "jane-doe" }).text, "https://www.linkedin.com/in/jane-doe");
  assert.ok(bad("social", { platform: "instagram", handle: "bad handle!" }).errors.handle);
  assert.ok(bad("social", { platform: "instagram", handle: "https://evil.com/x" }).errors.handle);
  assert.ok(bad("social", { platform: "x", handle: "a".repeat(40) }).errors.handle);
  const r = ok("social", { platform: "x", handle: "@ex_ample" });
  assert.equal(r.shareUrl, r.text);
});

test("plain text: limit is in bytes", () => {
  assert.equal(ok("text", { text: "x".repeat(MAX_TEXT_BYTES) }).text.length, MAX_TEXT_BYTES);
  assert.ok(bad("text", { text: "x".repeat(MAX_TEXT_BYTES + 1) }).errors.text);
  assert.ok(bad("text", { text: "✓".repeat(400) }).errors.text, "400 check marks are 1,200 bytes");
  assert.equal(byteLength("✓"), 3);
  assert.equal(byteLength("😀"), 4);
  assert.equal(ok("text", { text: "Hello ✓ 你好" }).text, "Hello ✓ 你好");
});

test("only links get a shareUrl", () => {
  assert.ok(ok("url", { url: "example.com" }).shareUrl);
  assert.ok(ok("whatsapp", { phone: "+15550100000", message: "" }).shareUrl);
  assert.equal(ok("wifi", { ssid: "A", security: "nopass", password: "", hidden: "" }).shareUrl, undefined);
  assert.equal(ok("text", { text: "hi" }).shareUrl, undefined);
  assert.equal(ok("contact", { firstName: "A" }).shareUrl, undefined);
});
