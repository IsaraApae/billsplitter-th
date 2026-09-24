// Thai PromptPay QR payload (EMVCo merchant-presented QR). Pure.

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as required by EMVCo. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

/** Accepts a mobile number (10 digits), national/tax ID (13) or e-wallet ID (15). */
export function isValidPromptPayId(id: string): boolean {
  const d = id.replace(/\D/g, "");
  return /^0\d{9}$/.test(d) || /^\d{13}$/.test(d) || /^\d{15}$/.test(d);
}

/**
 * Build the PromptPay payload. `amountMinor` is in satang; omit for a
 * reusable (static) QR where the payer types the amount.
 */
export function promptPayPayload(id: string, amountMinor?: number): string {
  const digits = id.replace(/\D/g, "");
  let target: string;
  let subTag: string;
  if (digits.length >= 15) {
    subTag = "03";
    target = digits;
  } else if (digits.length >= 13) {
    subTag = "02";
    target = digits;
  } else {
    subTag = "01";
    target = ("0000000000000" + digits.replace(/^0/, "66")).slice(-13);
  }
  const hasAmount = amountMinor !== undefined && amountMinor > 0;
  const merchant = tlv("00", "A000000677010111") + tlv(subTag, target);
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") +
    tlv("29", merchant) +
    tlv("58", "TH") +
    tlv("53", "764") +
    (hasAmount ? tlv("54", (amountMinor! / 100).toFixed(2)) : "") +
    "6304";
  return body + crc16(body);
}
