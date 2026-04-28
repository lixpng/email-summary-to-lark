import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { AppConfig } from './types';

function loadConfig(): AppConfig {
  const configPath = path.resolve(__dirname, '..', 'config.yaml');
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(content) as AppConfig;
}

export const config = loadConfig();
