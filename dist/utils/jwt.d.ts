interface TokenPayload {
    userId: string;
    role: string;
    jti: string;
}
export declare function verifyAccessToken(token: string): TokenPayload;
export declare function verifyRefreshToken(token: string): Promise<TokenPayload>;
export declare function generateTokenPair(userId: string, role: string): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export {};
//# sourceMappingURL=jwt.d.ts.map