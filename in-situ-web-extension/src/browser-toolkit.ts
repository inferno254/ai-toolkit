/// <reference path="../../browser-toolkit-types.d.ts" />
import { createToolkit } from '@ai4a11y/toolkit';
import { parseSkill } from '@ai4a11y/toolkit/core/skill';
import { asAATools } from '@ai4a11y/toolkit/registry';
import { renderWebSettings } from '@ai4a11y/toolkit/surfaces/web';
import { adaptersForTools, getProfile } from '@ai4a11y/tools/profiles/settings.js';
import readingAidMarkdown from '../../AI-for-Accessibility-Toolkit/toolkit/skills/builtin/reading-aid.md?raw';
import { createBrowserToolkit } from '../../browser-toolkit';

export const browserToolkit = createBrowserToolkit(
  {
    createToolkit,
    parseSkill,
    asAATools,
    getProfile,
    adaptersForTools,
    renderWebSettings,
  },
  readingAidMarkdown,
);
