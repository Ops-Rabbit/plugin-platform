export interface CompatibilityResult {
  compatible: boolean;
  reason: string;
}

export function checkApiCompatibility(
  requested: string,
  supported = "1.0",
): CompatibilityResult {
  const requestedMajor = parseMajor(requested);
  const supportedMajor = parseMajor(supported);
  if (requestedMajor === undefined || supportedMajor === undefined) {
    return {
      compatible: false,
      reason: "API versions must use major.minor numeric form.",
    };
  }
  return requestedMajor === supportedMajor
    ? {
        compatible: true,
        reason: `Plugin API ${requested} is supported by host API ${supported}.`,
      }
    : {
        compatible: false,
        reason: `Plugin API major ${requestedMajor} is incompatible with host major ${supportedMajor}.`,
      };
}

function parseMajor(version: string): number | undefined {
  const match = /^(\d+)\.\d+$/.exec(version);
  return match ? Number(match[1]) : undefined;
}
