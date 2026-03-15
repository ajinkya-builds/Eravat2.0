import fs from 'fs';
import path from 'path';

const SRC_DIR = './src';
const IGNORE_PATTERNS = ['node_modules', '.git', 'dist', 'build', '__tests__', 'test.ts'];

function findHardcodedStrings(dir, results = []) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_PATTERNS.some(pattern => file.includes(pattern))) {
                findHardcodedStrings(fullPath, results);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, index) => {
                // Look for potential hardcoded strings in JSX/TSX
                // Match strings in common UI patterns but exclude imports, comments, etc.
                const patterns = [
                    // JSX text content: >Some Text<
                    />\s*([A-Z][A-Za-z\s]{3,40})\s*</g,
                    // Button/Label text: "Some Text" or 'Some Text' (not in t() calls)
                    /(?<!t\()['"]([A-Z][A-Za-z\s]{3,40})['"]/g,
                ];

                patterns.forEach(pattern => {
                    const matches = [...line.matchAll(pattern)];
                    matches.forEach(match => {
                        const text = match[1].trim();
                        // Filter out common false positives
                        if (
                            text.length > 3 &&
                            !text.includes('import') &&
                            !text.includes('from') &&
                            !text.includes('const') &&
                            !text.includes('function') &&
                            !text.includes('return') &&
                            !text.includes('export') &&
                            !text.includes('interface') &&
                            !text.includes('type') &&
                            !text.match(/^[A-Z_]+$/) && // Skip constants
                            !text.match(/^\d/) && // Skip numbers
                            !text.match(/^https?:/) && // Skip URLs
                            !text.includes('className') &&
                            !text.includes('onClick') &&
                            !text.includes('onChange') &&
                            !text.includes('onSubmit')
                        ) {
                            results.push({
                                file: fullPath.replace('./src/', ''),
                                line: index + 1,
                                text: text,
                                context: line.trim().substring(0, 100)
                            });
                        }
                    });
                });
            });
        }
    }

    return results;
}

console.log('='.repeat(80));
console.log('SEARCHING FOR HARDCODED UI STRINGS');
console.log('='.repeat(80));
console.log();

const hardcodedStrings = findHardcodedStrings(SRC_DIR);

// Group by file
const byFile = {};
hardcodedStrings.forEach(item => {
    if (!byFile[item.file]) {
        byFile[item.file] = [];
    }
    byFile[item.file].push(item);
});

// Display results
const fileCount = Object.keys(byFile).length;
console.log(`Found potential hardcoded strings in ${fileCount} files:`);
console.log();

Object.keys(byFile).sort().forEach(file => {
    console.log(`📄 ${file}`);
    const items = byFile[file];
    const uniqueTexts = [...new Set(items.map(i => i.text))];
    uniqueTexts.slice(0, 10).forEach(text => {
        const item = items.find(i => i.text === text);
        console.log(`   Line ${item.line}: "${text}"`);
    });
    if (uniqueTexts.length > 10) {
        console.log(`   ... and ${uniqueTexts.length - 10} more`);
    }
    console.log();
});

console.log('='.repeat(80));
console.log(`Total potential hardcoded strings found: ${hardcodedStrings.length}`);
console.log('='.repeat(80));
