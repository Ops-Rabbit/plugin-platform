export function renderTemplate(
  source: string,
  values: Readonly<Record<string, string>>,
): string {
  return source.replace(
    /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g,
    (_match, key: string) => {
      const value = values[key];
      if (value === undefined)
        throw new Error(`Unknown template variable: ${key}`);
      return value;
    },
  );
}
