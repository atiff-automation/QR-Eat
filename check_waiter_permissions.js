const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWaiterPermissions() {
    try {
        // Check role_permissions for waiter
        const waiterPermissions = await prisma.rolePermission.findMany({
            where: {
                roleTemplate: 'waiter'
            },
            include: {
                permission: true
            }
        });

        console.log('\n🔑 Waiter Role Permissions:');
        console.log('Count:', waiterPermissions.length);

        if (waiterPermissions.length === 0) {
            console.log('\n❌ PROBLEM: No permissions found for roleTemplate "waiter"!');
            console.log('This is why login is failing - cannot compute permissions.');
        } else {
            console.log('\nPermissions:');
            waiterPermissions.forEach(rp => {
                console.log(`  - ${rp.permission.permissionKey}: ${rp.permission.description}`);
            });
        }

        // Also check manager for comparison
        const managerPermissions = await prisma.rolePermission.findMany({
            where: {
                roleTemplate: 'manager'
            }
        });

        console.log('\n📊 Comparison:');
        console.log('Manager permissions:', managerPermissions.length);
        console.log('Waiter permissions:', waiterPermissions.length);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkWaiterPermissions();
