// Imported first by every entry point, so .env is loaded before any module reads config.
import { loadEnvFile } from './load-env';

loadEnvFile();
