import {
  ORDER_NOT_FOUND_BODY,
  authenticationRequiredResponse,
  isAuthenticationFailure,
  orderNotFoundResponse,
} from '@/lib/api/refusals';

describe('shared refusal helper', () => {
  it('recognises the authentication failure thrown by requireAuth', () => {
    expect(isAuthenticationFailure(new Error('Authentication required'))).toBe(
      true
    );
    expect(
      isAuthenticationFailure(
        new Error('Authentication required: missing signed token')
      )
    ).toBe(true);
    expect(isAuthenticationFailure(new Error('Permission denied'))).toBe(false);
    expect(isAuthenticationFailure(new Error('database down'))).toBe(false);
    expect(isAuthenticationFailure('Authentication required')).toBe(false);
    expect(isAuthenticationFailure(null)).toBe(false);
  });

  it('returns the shared 401 body', async () => {
    const response = authenticationRequiredResponse();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Authentication required',
      code: 'AUTHENTICATION_REQUIRED',
    });
  });

  it('returns the shared order-not-found 404 body', async () => {
    const response = orderNotFoundResponse();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(ORDER_NOT_FOUND_BODY);
  });

  it('keeps the order-not-found body free of order data', () => {
    expect(Object.keys(ORDER_NOT_FOUND_BODY).sort()).toEqual([
      'code',
      'error',
      'success',
    ]);
  });
});
