import assert from 'node:assert/strict';
import fs from 'node:fs';

const assessment = fs.readFileSync(new URL('../public/assessment/index.html', import.meta.url), 'utf8');

const cameraStart = assessment.indexOf('<div class="kcac-cam-wrap" id="kcac-cam-wrap">');
const mediaControls = assessment.indexOf('<div class="cam-controls kcac-media-controls">', cameraStart);
const overlayStart = assessment.indexOf('<div class="kcac-guide-overlay"', cameraStart);
assert.ok(cameraStart >= 0 && overlayStart > cameraStart && overlayStart < mediaControls, 'guide controls must be overlaid inside the photo area');
assert.equal((assessment.match(/id="kcacGuideSize"/g) || []).length, 1, 'guide size control must not be duplicated below the photo');
assert.equal((assessment.match(/id="kcacGuideOpacity"/g) || []).length, 1, 'guide opacity control must not be duplicated below the photo');
assert.equal((assessment.match(/id="kcacG0"/g) || []).length, 1, 'guide toggle controls must have unique IDs');
assert.match(assessment, /\.kcac-guide-overlay\{position:absolute;z-index:30;/, 'photo guide panel must float above the canvas');
assert.match(assessment, /function centerKcacGuide\(\)[\s\S]*?guidePos = \{rx:0\.5, ry:0\.5\}/, 'one-touch guide centering must be available');

process.stdout.write('Stage188 KCAC photo guide overlay tests passed.\n');
