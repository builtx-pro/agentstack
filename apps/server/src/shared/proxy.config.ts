import { isIP } from "node:net";

/** Only explicit proxy addresses/subnets are trusted; forwarded headers otherwise remain untrusted. */
export function parseTrustedProxies(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const entries = value.split(",").map((item) => item.trim());
  if (entries.length > 32 || entries.some((item) => !item))
    throw new Error(
      "TRUST_PROXY must list explicit IP addresses/CIDRs or loopback.",
    );
  for (const entry of entries) {
    if (entry === "loopback") continue;
    const parts = entry.split("/");
    const address = parts[0]!;
    const family = isIP(address);
    if (!family || parts.length > 2)
      throw new Error(
        "TRUST_PROXY accepts only IP addresses, CIDRs or loopback; never true or wildcard.",
      );
    if (parts.length === 2) {
      const prefix = parts[1]!;
      if (
        !/^\d+$/.test(prefix) ||
        Number(prefix) < 1 ||
        Number(prefix) > (family === 4 ? 32 : 128)
      )
        throw new Error(
          "TRUST_PROXY CIDR must be a bounded network; /0 is forbidden.",
        );
    }
  }
  // Opposite /1 networks together are also an accidental trust-all configuration.
  if (
    (entries.includes("0.0.0.0/1") && entries.includes("128.0.0.0/1")) ||
    (entries.includes("::/1") && entries.includes("8000::/1"))
  )
    throw new Error("TRUST_PROXY cannot trust the entire address space.");
  return [...new Set(entries)];
}
