'use client';

import { useState } from 'react';

export default function SimpleLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async () => {
    console.log('Login attempt:', { email, password });
    setMessage('Attempting login...');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      console.log('Response:', data);

      if (response.ok) {
        setMessage('Login successful! Redirecting...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      } else {
        setMessage(`Login failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Login error:', error);
      setMessage(`Network error: ${error}`);
    }
  };

  const fillCredentials = () => {
    console.log('Filling credentials...');
    setEmail('manager@marios-local.com');
    setPassword('password123');
    setMessage('Credentials filled!');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-4 p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-bold text-center">Simple Login Test</h1>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter email"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="Enter password"
          />
        </div>

        <button
          onClick={fillCredentials}
          className="w-full bg-gray-500 text-white py-2 px-4 rounded hover:bg-gray-600"
        >
          Fill Manager Credentials
        </button>

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
        >
          Login
        </button>

        {message && (
          <div className="p-3 bg-gray-100 rounded text-center">{message}</div>
        )}

        <div className="text-sm text-gray-600 text-center">
          <p>Test with: manager@marios-local.com / password123</p>
        </div>
      </div>
    </div>
  );
}
