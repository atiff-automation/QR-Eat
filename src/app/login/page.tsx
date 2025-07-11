'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Get redirect URL from query params
  const [redirectTo, setRedirectTo] = useState('/dashboard');
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const redirect = searchParams.get('redirect');
    console.log('Redirect parameter from searchParams:', redirect);
    
    // Also try getting it directly from URL as backup
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRedirect = urlParams.get('redirect');
      console.log('Redirect parameter from URL:', urlRedirect);
      
      const finalRedirect = redirect || urlRedirect;
      if (finalRedirect) {
        setRedirectTo(finalRedirect);
        console.log('Setting redirectTo to:', finalRedirect);
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Current redirectTo at submit:', redirectTo);
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Check user role and redirect accordingly
        const staff = data.staff;
        let finalRedirect = redirectTo;
        
        // If specific redirect URL is provided, use it
        if (redirectTo !== '/dashboard') {
          finalRedirect = redirectTo;
        }
        // Otherwise, check user role for smart defaults
        else if (staff?.role?.name === 'Kitchen') {
          finalRedirect = '/dashboard/kitchen';
        }
        
        console.log('Final redirect:', finalRedirect);
        // Force a hard refresh to ensure cookies are properly set
        window.location.href = finalRedirect;
      } else {
        console.error('Login failed:', data);
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Network error:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Staff Login
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            QR Restaurant System
          </p>
          {redirectTo !== '/dashboard' && (
            <p className="mt-1 text-center text-xs text-blue-600">
              Will redirect to: {redirectTo}
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          <div className="text-center text-sm text-gray-500">
            <p className="mt-4">Test Credentials:</p>
            <p>Manager: manager@marios-local.com / password123</p>
            <p>Server: server@marios-local.com / password123</p>
            <p>Kitchen: kitchen@marios-local.com / password123</p>

            <button
              type="button"
              onClick={() => {
                console.log('Test button clicked!');
                setEmail('manager@marios-local.com');
                setPassword('password123');
              }}
              className="mt-2 text-blue-600 underline mr-4"
            >
              Fill Manager Credentials
            </button>
            
            <button
              type="button"
              onClick={() => {
                setEmail('kitchen@marios-local.com');
                setPassword('password123');
              }}
              className="mt-2 text-blue-600 underline"
            >
              Fill Kitchen Credentials
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
