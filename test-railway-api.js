/**
 * Test Railway API endpoint to see actual error
 */

async function testAPI() {
    const baseUrl = 'https://qr-eat-production.up.railway.app';

    try {
        console.log('Testing /api/orders endpoint...\n');

        const response = await fetch(`${baseUrl}/api/orders?startDate=2026-01-03T16:00:00.000Z&status=all&excludeServed=true&limit=50`, {
            headers: {
                'Accept': 'application/json',
            }
        });

        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);

        const text = await response.text();
        console.log('\nResponse Body:');
        console.log(text);

        // Try to parse as JSON
        try {
            const json = JSON.parse(text);
            console.log('\nParsed JSON:');
            console.log(JSON.stringify(json, null, 2));
        } catch (e) {
            console.log('\n(Response is not JSON)');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

testAPI();
