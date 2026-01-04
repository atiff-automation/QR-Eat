/**
 * COMPREHENSIVE ENUM AUDIT SCRIPT
 * This will check EVERY file for lowercase status values
 */

const fs = require('fs');
const path = require('path');

// All possible lowercase status values we need to find
const statusPatterns = [
    // Order statuses
    { pattern: /'pending'/g, name: 'pending', correct: 'PENDING' },
    { pattern: /'confirmed'/g, name: 'confirmed', correct: 'CONFIRMED' },
    { pattern: /'preparing'/g, name: 'preparing', correct: 'PREPARING' },
    { pattern: /'ready'/g, name: 'ready', correct: 'READY' },
    { pattern: /'served'/g, name: 'served', correct: 'SERVED' },
    { pattern: /'cancelled'/g, name: 'cancelled', correct: 'CANCELLED' },

    // Payment statuses
    { pattern: /'paid'/g, name: 'paid', correct: 'PAID' },
    { pattern: /'completed'/g, name: 'completed', correct: 'COMPLETED' },
    { pattern: /'refunded'/g, name: 'refunded', correct: 'REFUNDED' },
    { pattern: /'failed'/g, name: 'failed', correct: 'FAILED' },

    // Table statuses
    { pattern: /'available'/g, name: 'available', correct: 'AVAILABLE' },
    { pattern: /'occupied'/g, name: 'occupied', correct: 'OCCUPIED' },
    { pattern: /'reserved'/g, name: 'reserved', correct: 'RESERVED' },

    // Session statuses
    { pattern: /'active'/g, name: 'active', correct: 'ACTIVE' },
    { pattern: /'ended'/g, name: 'ended', correct: 'ENDED' },
    { pattern: /'expired'/g, name: 'expired', correct: 'EXPIRED' },
];

const results = {
    filesWithIssues: [],
    totalIssues: 0,
    issuesByType: {},
};

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileIssues = [];

    statusPatterns.forEach(({ pattern, name, correct }) => {
        const matches = content.match(pattern);
        if (matches) {
            // Check if it's in a comment or string literal that's okay
            const lines = content.split('\n');
            let issueCount = 0;

            lines.forEach((line, lineNum) => {
                if (pattern.test(line)) {
                    // Skip if it's just in a comment
                    const commentIndex = line.indexOf('//');
                    const matchIndex = line.search(pattern);

                    // Skip JSDoc comments and example code in comments
                    if (commentIndex !== -1 && matchIndex > commentIndex) {
                        return; // This is in a comment, skip
                    }

                    // Skip if it's in a JSDoc example
                    if (line.trim().startsWith('*') && line.includes('const') && line.includes('=')) {
                        return; // This is example code in JSDoc
                    }

                    issueCount++;
                    fileIssues.push({
                        line: lineNum + 1,
                        status: name,
                        correct: correct,
                        content: line.trim(),
                    });
                }
            });

            if (issueCount > 0) {
                if (!results.issuesByType[name]) {
                    results.issuesByType[name] = 0;
                }
                results.issuesByType[name] += issueCount;
                results.totalIssues += issueCount;
            }
        }
    });

    if (fileIssues.length > 0) {
        results.filesWithIssues.push({
            file: filePath,
            issues: fileIssues,
        });
    }
}

function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // Skip node_modules, .next, .git
            if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(file)) {
                walkDir(filePath, fileList);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

console.log('🔍 COMPREHENSIVE ENUM AUDIT\n');
console.log('Scanning all TypeScript files for lowercase status values...\n');

const srcDir = path.join(__dirname, 'src');
const files = walkDir(srcDir);

console.log(`Found ${files.length} TypeScript files to check\n`);

files.forEach(file => checkFile(file));

// Print results
console.log('═'.repeat(80));
console.log('AUDIT RESULTS');
console.log('═'.repeat(80));

if (results.totalIssues === 0) {
    console.log('\n✅ PERFECT! No lowercase status values found.');
    console.log('✅ All enums are properly standardized to uppercase.\n');
} else {
    console.log(`\n⚠️  Found ${results.totalIssues} lowercase status values in ${results.filesWithIssues.length} files\n`);

    console.log('Issues by status type:');
    Object.entries(results.issuesByType).forEach(([status, count]) => {
        console.log(`  - '${status}': ${count} occurrences`);
    });

    console.log('\n' + '─'.repeat(80));
    console.log('DETAILED FINDINGS:\n');

    results.filesWithIssues.forEach(({ file, issues }) => {
        console.log(`\n📄 ${file.replace(__dirname + path.sep, '')}`);
        issues.forEach(({ line, status, correct, content }) => {
            console.log(`   Line ${line}: '${status}' → should be '${correct}'`);
            console.log(`   ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
        });
    });

    console.log('\n' + '═'.repeat(80));
}

// Exit with error code if issues found
process.exit(results.totalIssues > 0 ? 1 : 0);
