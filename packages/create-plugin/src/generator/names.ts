export interface PluginNames {
  id: string;
  packageName: string;
  displayName: string;
}

export function normalizePluginName(input: string): PluginNames {
  const id = input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(
      "Plugin name must contain letters and may contain numbers or separators.",
    );
  }
  return {
    id,
    packageName: `opsrabbit-plugin-${id}`,
    displayName: id
      .split("-")
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" "),
  };
}
