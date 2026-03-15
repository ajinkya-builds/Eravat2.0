import fs from 'fs';
import path from 'path';

const SRC_DIR = './src';
const TRANSLATIONS_FILE = './src/i18n/translations.ts';

// Find all translation keys used in the codebase
function findKeysInRange(dir) {
    let keys = new Set();
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist' && file !== 'build') {
                findKeysInRange(fullPath).forEach(k => keys.add(k));
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Find t('key'), t("key"), t(`key`)
            const matches = content.matchAll(/t\(['"`]([^'"`]+)['"`]\)/g);
            for (const match of matches) {
                keys.add(match[1]);
            }
        }
    }
    return keys;
}

// Extract all keys from translations.ts for both English and Hindi
function extractTranslationKeys() {
    const content = fs.readFileSync(TRANSLATIONS_FILE, 'utf8');

    // Find English section
    const enMatch = content.match(/en:\s*\{([\s\S]*?)\n\s*\},\s*hi:/);
    // Find Hindi section
    const hiMatch = content.match(/hi:\s*\{([\s\S]*?)\n\s*\}/);

    const enKeys = new Set();
    const hiKeys = new Set();

    if (enMatch) {
        const enSection = enMatch[1];
        const keyMatches = enSection.matchAll(/^\s*['"]?([a-zA-Z0-9._]+)['"]?\s*:/gm);
        for (const match of keyMatches) {
            enKeys.add(match[1]);
        }
    }

    if (hiMatch) {
        const hiSection = hiMatch[1];
        const keyMatches = hiSection.matchAll(/^\s*['"]?([a-zA-Z0-9._]+)['"]?\s*:/gm);
        for (const match of keyMatches) {
            hiKeys.add(match[1]);
        }
    }

    return { enKeys, hiKeys };
}

console.log('='.repeat(80));
console.log('TRANSLATION COVERAGE ANALYSIS');
console.log('='.repeat(80));
console.log();

// Find all keys used in code
const usedKeys = Array.from(findKeysInRange(SRC_DIR)).sort();
console.log(`📊 Total translation keys used in code: ${usedKeys.length}`);
console.log();

// Extract keys from translations file
const { enKeys, hiKeys } = extractTranslationKeys();
console.log(`📝 English translations defined: ${enKeys.size}`);
console.log(`🇮🇳 Hindi translations defined: ${hiKeys.size}`);
console.log();

// Find missing keys (used in code but not in translations)
const missingInEn = usedKeys.filter(k => !enKeys.has(k));
const missingInHi = usedKeys.filter(k => !hiKeys.has(k));

console.log('─'.repeat(80));
console.log('❌ MISSING IN ENGLISH TRANSLATIONS');
console.log('─'.repeat(80));
if (missingInEn.length > 0) {
    console.log(`Found ${missingInEn.length} keys used in code but missing in English:`);
    missingInEn.forEach(k => console.log(`  • ${k}`));
} else {
    console.log('✅ All used keys are defined in English!');
}
console.log();

console.log('─'.repeat(80));
console.log('❌ MISSING IN HINDI TRANSLATIONS');
console.log('─'.repeat(80));
if (missingInHi.length > 0) {
    console.log(`Found ${missingInHi.length} keys used in code but missing in Hindi:`);
    missingInHi.forEach(k => console.log(`  • ${k}`));
} else {
    console.log('✅ All used keys are defined in Hindi!');
}
console.log();

// Find keys in English but not in Hindi
const inEnNotInHi = Array.from(enKeys).filter(k => !hiKeys.has(k)).sort();
console.log('─'.repeat(80));
console.log('⚠️  KEYS IN ENGLISH BUT NOT IN HINDI');
console.log('─'.repeat(80));
if (inEnNotInHi.length > 0) {
    console.log(`Found ${inEnNotInHi.length} keys defined in English but missing in Hindi:`);
    inEnNotInHi.forEach(k => console.log(`  • ${k}`));
} else {
    console.log('✅ Hindi has all keys from English!');
}
console.log();

// Find keys in Hindi but not in English (shouldn't happen)
const inHiNotInEn = Array.from(hiKeys).filter(k => !enKeys.has(k)).sort();
console.log('─'.repeat(80));
console.log('⚠️  KEYS IN HINDI BUT NOT IN ENGLISH');
console.log('─'.repeat(80));
if (inHiNotInEn.length > 0) {
    console.log(`Found ${inHiNotInEn.length} keys defined in Hindi but missing in English:`);
    inHiNotInEn.forEach(k => console.log(`  • ${k}`));
} else {
    console.log('✅ English has all keys from Hindi!');
}
console.log();

// Summary
console.log('='.repeat(80));
console.log('📈 SUMMARY');
console.log('='.repeat(80));
console.log(`Total keys used in code: ${usedKeys.length}`);
console.log(`Keys missing in English: ${missingInEn.length}`);
console.log(`Keys missing in Hindi: ${missingInHi.length}`);
console.log(`Keys in English but not Hindi: ${inEnNotInHi.length}`);
console.log(`Keys in Hindi but not English: ${inHiNotInEn.length}`);
console.log();

if (inEnNotInHi.length === 0 && missingInHi.length === 0) {
    console.log('✅ PERFECT! All translations are complete for both languages!');
} else {
    console.log('❌ ACTION REQUIRED: Some translations are incomplete.');
    console.log(`   Add ${inEnNotInHi.length + missingInHi.length} missing Hindi translations.`);
}
console.log('='.repeat(80));
