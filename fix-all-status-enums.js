/**
 * Batch replace all lowercase status values with uppercase in API files
 * This is necessary because we migrated to Prisma enums which use uppercase values
 */

const fs = require('fs');
const path = require('path');

const replacements = [
    // Order statuses
    { from: /'pending'/g, to: "'PENDING'" },
    { from: /'confirmed'/g, to: "'CONFIRMED'" },
    { from: /'preparing'/g, to: "'PREPARING'" },
    { from: /'ready'/g, to: "'READY'" },
    { from: /'served'/g, to: "'SERVED'" },
    { from: /'cancelled'/g, to: "'CANCELLED'" },

    // Payment statuses
    { from: /'paid'/g, to: "'PAID'" },
    { from: /'completed'/g, to: "'COMPLETED'" },
    { from: /'refunded'/g, to: "'REFUNDED'" },
    { from: /'failed'/g, to: "'FAILED'" },

    // Table statuses
    { from: /'available'/g, to: "'AVAILABLE'" },
    { from: /'occupied'/g, to: "'OCCUPIED'" },
    { from: /'reserved'/g, to: "'RESERVED'" },

    // Session statuses
    { from: /'active'/g, to: "'ACTIVE'" },
    { from: /'ended'/g, to: "'ENDED'" },
    { from: /'expired'/g, to: "'EXPIRED'" },
];

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    replacements.forEach(({ from, to }) => {
        if (from.test(content)) {
            content = content.replace(from, to);
            modified = true;
        }
    });

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated: ${filePath}`);
        return 1;
    }
    return 0;
}

function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDir(filePath, fileList);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

console.log('🔄 Starting batch status enum replacement...\n');

const apiDir = path.join(__dirname, 'src', 'app', 'api');
const files = walkDir(apiDir);

let updatedCount = 0;
files.forEach(file => {
    updatedCount += processFile(file);
});

console.log(`\n✅ Complete! Updated ${updatedCount} files.`);
