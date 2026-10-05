/** Access-token claims are pinned: HS256 only, fixed issuer and audience. */
export const JWT_ISSUER = 'atrium';
export const JWT_AUDIENCE = 'atrium-api';
export const JWT_ALGORITHMS = ['HS256'] as const;
