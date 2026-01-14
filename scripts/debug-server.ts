import fetch from 'node-fetch';

async function main() {
  const restaurantId = 'cb28dac2-b56a-4b56-9519-0345fed10b42';
  const url = `http://localhost:3000/api/menu/${restaurantId}`;

  console.log(`Fetching: ${url}`);
  try {
    const response = await fetch(url);
    console.log(`Status: ${response.status} ${response.statusText}`);

    const text = await response.text();
    console.log('Response Body Preview (first 2000 chars):');
    console.log(text.substring(0, 2000));
  } catch (error) {
    console.error('Fetch failed:', error);
  }
}

main();
