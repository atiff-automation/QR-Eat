import { NextRequest } from 'next/server';
import { getSubdomainInfo } from '@/lib/subdomain';

function requestFor(host: string): NextRequest {
  return new NextRequest(`https://${host}/login`, {
    headers: { host },
  });
}

describe('subdomain main-domain configuration', () => {
  const originalMainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN;

  afterEach(() => {
    if (originalMainDomain === undefined) {
      delete process.env.NEXT_PUBLIC_MAIN_DOMAIN;
    } else {
      process.env.NEXT_PUBLIC_MAIN_DOMAIN = originalMainDomain;
    }
  });

  it('treats the configured staging host as the main domain', () => {
    process.env.NEXT_PUBLIC_MAIN_DOMAIN =
      'qr-eat-staging-staging.up.railway.app';

    const info = getSubdomainInfo(
      requestFor('qr-eat-staging-staging.up.railway.app')
    );

    expect(info.isMainDomain).toBe(true);
    expect(info.isSubdomain).toBe(false);
  });

  it('still treats a restaurant subdomain as a tenant', () => {
    process.env.NEXT_PUBLIC_MAIN_DOMAIN = 'staging.tabtep.app';

    const info = getSubdomainInfo(
      requestFor('marios-authentic-italian.staging.tabtep.app')
    );

    expect(info.isMainDomain).toBe(false);
    expect(info.isSubdomain).toBe(true);
    expect(info.subdomain).toBe('marios-authentic-italian');
  });
});
