const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkManagerRole() {
    try {
        // Find manager staff
        const manager = await prisma.staff.findFirst({
            where: {
                email: 'mario@marios-authentic.com'
            },
            include: {
                role: true
            }
        });

        console.log('\n📋 Manager Staff Record:');
        console.log('Email:', manager?.email);
        console.log('Staff Role Name:', manager?.role?.name);

        // Check UserRole table
        const userRole = await prisma.userRole.findFirst({
            where: {
                userId: manager?.id,
                userType: 'staff'
            }
        });

        console.log('\n🔑 UserRole Record:');
        console.log('UserType:', userRole?.userType);
        console.log('RoleTemplate:', userRole?.roleTemplate);
        console.log('\n⚠️  FOUND THE ISSUE:');
        console.log('- userType is "staff", NOT "manager"');
        console.log('- roleTemplate is:', userRole?.roleTemplate);
        console.log('- Our code checks: userRole === "manager"');
        console.log('- But it should check: roleTemplate === "manager"');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkManagerRole();
