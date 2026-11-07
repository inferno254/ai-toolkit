export interface ToolkitNeed {
  dimension: string;
  value: unknown;
  strength: 'floor' | 'preference' | 'hint';
  source?: string;
}

export interface ToolkitAbilityModel {
  schemaVersion: number;
  supportAreas: string[];
  freeText: string;
  language: string;
  readingLevel: string | null;
  confidence: number | null;
  needs: ToolkitNeed[];
}

export interface ToolkitSkill {
  name: string;
  description: string;
  supportAreas: string[];
  siteRelevance: string[];
  recipe: {
    adapters: Array<{ id: string; settings?: Object }>;
    actions?: Array<{ prompt: string; name?: string }>;
  };
  body: string;
  source?: 'builtin' | 'mine';
}

export interface ToolkitProfile {
  supportAreas?: string[];
  fields?: Record<string, unknown> & { needs?: unknown[] };
}

export interface ToolkitLibrarian {
  getAbilityModel(): Promise<ToolkitAbilityModel>;
  getProfile(): Promise<ToolkitProfile | null>;
  setProfileField(path: string, value: unknown): Promise<unknown>;
  retrieveSkill(url: string, contexts?: string[]): Promise<ToolkitSkill | null>;
  resolveSkill(skill: ToolkitSkill): {
    settings: Record<string, unknown>;
    adapterIds: string[];
    actions: Array<{ prompt: string; name?: string }>;
  };
}

export interface ToolkitKV {
  get(area: string, key: string): Promise<unknown>;
  set(area: string, key: string, value: unknown): Promise<void>;
  getAll(area: string): Promise<Record<string, unknown>>;
}

export interface ToolkitToolsRegistry {
  version?: number;
  list?: Array<{
    id: string;
    name: string;
    description: string;
    supportAreas: string[];
    siteRelevance: string[];
    settings?: Record<string, unknown>;
    requiresAI?: boolean;
    icon?: string;
    emoji?: string;
    quickStart?: boolean;
  }>;
  settingsMeta: Record<string, {
    type: string;
    range?: number[];
    options?: string[];
    description?: string;
  }>;
}

export interface ToolkitProfileCatalogEntry {
  name: string;
  description: string;
  tools: Record<string, boolean | number | string>;
}

export interface ToolkitBindings {
  createToolkit(options: {
    kv: ToolkitKV;
    toolsRegistry: ToolkitToolsRegistry;
    builtinSkills: ToolkitSkill[];
  }): {
    datastore: { runMigrations(): Promise<unknown> };
    librarian: ToolkitLibrarian;
  };
  parseSkill(markdown: string): ToolkitSkill;
  asAATools(): ToolkitToolsRegistry;
  getProfile(id: string): ToolkitProfileCatalogEntry | undefined;
  adaptersForTools(tools: Record<string, boolean | number | string> | undefined): string[];
  renderWebSettings(model: ToolkitAbilityModel): Record<string, unknown>;
}

export interface BrowserPreferences {
  profileId: 'lowVision' | null;
  textSize: number;
  readAloudRate: number;
  webSettings: Record<string, unknown>;
}

export interface SkillPlan {
  skill: ToolkitSkill;
  settings: Record<string, unknown>;
  adapterIds: string[];
  actions: Array<{ prompt: string; name?: string }>;
}

const PROFILE_FIELD_PATH = 'fields.browserProfile';
const NEEDS_FIELD_PATH = 'fields.needs';
const SUPPORT_AREAS_FIELD_PATH = 'supportAreas';
const DEFAULT_TEXT_SIZE = 1;
const DEFAULT_READ_ALOUD_RATE = 0.9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function findNeedValue(model: ToolkitAbilityModel, dimension: string, fallback: number): number {
  const need = model.needs.find((entry) => entry.dimension === dimension);
  return isFiniteNumber(need?.value) ? need.value : fallback;
}

export function createBrowserToolkit(bindings: ToolkitBindings, readingAidMarkdown: string) {
  let toolkitPromise: ReturnType<ToolkitBindings['createToolkit']> | undefined;
  let migrationPromise: Promise<unknown> | undefined;

  async function getLibrarian(): Promise<ToolkitLibrarian> {
    if (!toolkitPromise) {
      const builtinSkills = [bindings.parseSkill(readingAidMarkdown)];
      const created = bindings.createToolkit({
        kv: createLocalKV(),
        toolsRegistry: bindings.asAATools(),
        builtinSkills,
      });
      toolkitPromise = created;
    }

    if (!migrationPromise) migrationPromise = toolkitPromise.datastore.runMigrations();
    try {
      await migrationPromise;
    } catch (error) {
      migrationPromise = undefined;
      throw error;
    }
    return toolkitPromise.librarian;
  }

  async function getPreferences(): Promise<BrowserPreferences> {
    const librarian = await getLibrarian();
    const [model, profile] = await Promise.all([
      librarian.getAbilityModel(),
      librarian.getProfile(),
    ]);

    return {
      profileId: profile?.fields?.browserProfile === 'lowVision' ? 'lowVision' : null,
      textSize: findNeedValue(model, 'textSize', DEFAULT_TEXT_SIZE),
      readAloudRate: findNeedValue(model, 'readAloudRate', DEFAULT_READ_ALOUD_RATE),
      webSettings: bindings.renderWebSettings(model),
    };
  }

  async function savePreferences(
    preferences: Pick<BrowserPreferences, 'profileId' | 'textSize' | 'readAloudRate'>,
  ): Promise<BrowserPreferences> {
    const librarian = await getLibrarian();
    const model = await librarian.getAbilityModel();
    const supportAreas = new Set(model.supportAreas);

    if (preferences.profileId === 'lowVision') supportAreas.add('vision');
    else supportAreas.delete('vision');

    const needs = model.needs.filter(
      (need) => need.dimension !== 'textSize' && need.dimension !== 'readAloudRate',
    );
    const lowVisionFontScale = bindings.getProfile('lowVision')?.tools.fontScale;
    const textSize = preferences.profileId === 'lowVision'
      && !model.needs.some((need) => need.dimension === 'textSize')
      && typeof lowVisionFontScale === 'number'
      ? lowVisionFontScale / 100
      : preferences.textSize;
    needs.push(
      {
        dimension: 'textSize',
        value: textSize,
        strength: 'preference',
        source: 'browser-preferences',
      },
      {
        dimension: 'readAloudRate',
        value: preferences.readAloudRate,
        strength: 'preference',
        source: 'browser-preferences',
      },
    );

    await librarian.setProfileField(SUPPORT_AREAS_FIELD_PATH, [...supportAreas]);
    await librarian.setProfileField(PROFILE_FIELD_PATH, preferences.profileId);
    await librarian.setProfileField(NEEDS_FIELD_PATH, needs);
    return getPreferences();
  }

  function getProfileAdapterIds(): string[] {
    const profile = bindings.getProfile('lowVision');
    return bindings.adaptersForTools(profile?.tools);
  }

  async function retrieveReadingAid(url: string): Promise<SkillPlan | null> {
    const librarian = await getLibrarian();
    const skill = await librarian.retrieveSkill(url);
    if (!skill) return null;
    const plan = librarian.resolveSkill(skill);
    return { skill, ...plan };
  }

  return { getPreferences, savePreferences, getProfileAdapterIds, retrieveReadingAid };
}

function createLocalKV(): ToolkitKV {
  function keyFor(area: string, key: string): string {
    return `ai4a11y.toolkit.${area}.${key}`;
  }

  return {
    async get(area, key) {
      const serialized = localStorage.getItem(keyFor(area, key));
      if (serialized === null) return undefined;
      return JSON.parse(serialized) as unknown;
    },
    async set(area, key, value) {
      localStorage.setItem(keyFor(area, key), JSON.stringify(value));
    },
    async getAll(area) {
      const prefix = `ai4a11y.toolkit.${area}.`;
      const values: Record<string, unknown> = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const serialized = localStorage.getItem(key);
        if (serialized !== null) values[key.slice(prefix.length)] = JSON.parse(serialized) as unknown;
      }
      return values;
    },
  };
}
