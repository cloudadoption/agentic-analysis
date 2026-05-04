import * as da from './content/da.js';
import * as rclone from './content/rclone.js';
import * as local from './content/local.js';
import * as manual from './content/manual.js';
import * as none from './content/none.js';

const strategies = { da, rclone, local, manual, none };

export async function cloneContent({ projectDir, contentConfig }) {
  const strategy = strategies[contentConfig.source];
  if (!strategy) throw new Error(`Unknown content source: ${contentConfig.source}`);
  return strategy.clone({ projectDir, contentConfig });
}
