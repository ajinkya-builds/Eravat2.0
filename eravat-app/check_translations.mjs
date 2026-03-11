import fs from 'fs';
import path from 'path';

const SRC_DIR = './src';
const TRANSLATIONS_FILE = './src/i18n/translations.ts';

function findKeysInRange(dir) {
    let keys = new Set();
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                findKeysInRange(fullPath).forEach(k => keys.add(k));
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Support t('key'), t("key"), t(`key`), and also variables like t(item.label) which we can't easily find with regex
            const matches = content.matchAll(/t\(['"]([^'"]+)['"]\)/g);
            for (const match of matches) {
                keys.add(match[1]);
            }
        }
    }
    return keys;
}

const allKeys = Array.from(findKeysInRange(SRC_DIR)).sort();
const translationsContent = fs.readFileSync(TRANSLATIONS_FILE, 'utf8');

const missingKeys = [];
for (const key of allKeys) {
    if (!translationsContent.includes(`"${key}":`) && !translationsContent.includes(`'${key}':`)) {
        missingKeys.push(key);
    }
}

console.log('--- ALL KEYS FOUND ---');
allKeys.forEach(k => console.log(k));

console.log('\n--- MISSING KEYS ---');
missingKeys.forEach(k => console.log(k));
