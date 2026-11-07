declare module '@ai4a11y/tools/profiles/settings.js' {
  export interface ProfileDefinition {
    name: string;
    description: string;
    tools: Record<string, boolean | number | string>;
  }

  export function getProfile(profileId: string): ProfileDefinition | undefined;
  export function adaptersForTools(
    tools: Record<string, boolean | number | string> | undefined,
  ): string[];
}

declare module '*?raw' {
  const source: string;
  export default source;
}
