'use client';

import { useState } from 'react';

export default function TestPage() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Test Page</h1>
        <p className="mb-4">Count: {count}</p>
        <button
          onClick={() => {
            console.log('Button clicked!');
            setCount(count + 1);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Click me ({count})
        </button>
      </div>
    </div>
  );
}
