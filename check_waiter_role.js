// Test script to check what roleTemplate the waiter has
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkWaiterRole() {
    try {
        // Find waiter
        const waiter = await prisma.staff.findFirst({
            where: {
                email: 'luigi@marios-authentic.com'
            },
            include: {
                role: true
            }
        });

        console.log('\n👤 Waiter Staff Record:');
        console.log('Email:', waiter?.email);
        console.log('Staff Role Name:', waiter?.role?.name);
        console.log('Staff Role ID:', waiter?.role?.id);

        // Check UserRole table
        const userRole = await prisma.userRole.findFirst({
            where: {
                userId: waiter?.id,
                userType: 'staff'
            }
        });

        console.log('\n🔑 UserRole Record:');
        console.log('UserType:', userRole?.userType);
        console.log('RoleTemplate:', userRole?.roleTemplate);
        console.log('Is Active:', userRole?.isActive);

        // Check if roleTemplate is null/undefined
        if (!userRole?.roleTemplate) {
            console.log('\n❌ PROBLEM: roleTemplate is NULL or UNDEFINED!');
            console.log('This is why permission checks are failing.');
        } else {
            console.log('\n✅ roleTemplate exists:', userRole.roleTemplate);
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkWaiterRole();
