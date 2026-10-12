/*
  Better Auth (ADR 0071, TC-06): adds the core and OAuth-provider tables,
  switches User.emailVerified from a DateTime to a Boolean (renaming the old
  column rather than dropping it — see the AlterTable below), and drops
  McpToken (replaced by OAuth access tokens).
*/
-- DropForeignKey
ALTER TABLE "McpToken" DROP CONSTRAINT "McpToken_userId_fkey";

-- AlterTable: User.updatedAt gains an explicit default (ADR 0071's User spec).
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "Jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[],
    "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[],
    "postLogoutRedirectUris" TEXT[],
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" TEXT[],
    "responseTypes" TEXT[],
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN NOT NULL DEFAULT false,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "OauthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN NOT NULL DEFAULT false,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "OauthResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "OauthClientResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "OauthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthAccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[],

    CONSTRAINT "OauthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" TEXT[],
    "requestedUserInfoClaims" TEXT[],
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "OauthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OauthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OauthClientAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");

-- CreateIndex
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "OauthClient_clientId_key" ON "OauthClient"("clientId");

-- CreateIndex
CREATE INDEX "OauthClient_userId_idx" ON "OauthClient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthResource_identifier_key" ON "OauthResource"("identifier");

-- CreateIndex
CREATE INDEX "OauthClientResource_clientId_idx" ON "OauthClientResource"("clientId");

-- CreateIndex
CREATE INDEX "OauthClientResource_resourceId_idx" ON "OauthClientResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthClientResource_clientId_resourceId_key" ON "OauthClientResource"("clientId", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthRefreshToken_token_key" ON "OauthRefreshToken"("token");

-- CreateIndex
CREATE INDEX "OauthRefreshToken_clientId_idx" ON "OauthRefreshToken"("clientId");

-- CreateIndex
CREATE INDEX "OauthRefreshToken_sessionId_idx" ON "OauthRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "OauthRefreshToken_userId_idx" ON "OauthRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "OauthRefreshToken_authorizationCodeId_idx" ON "OauthRefreshToken"("authorizationCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "OauthAccessToken_token_key" ON "OauthAccessToken"("token");

-- CreateIndex
CREATE INDEX "OauthAccessToken_clientId_idx" ON "OauthAccessToken"("clientId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_sessionId_idx" ON "OauthAccessToken"("sessionId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_userId_idx" ON "OauthAccessToken"("userId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_authorizationCodeId_idx" ON "OauthAccessToken"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "OauthAccessToken_refreshId_idx" ON "OauthAccessToken"("refreshId");

-- CreateIndex
CREATE INDEX "OauthConsent_clientId_idx" ON "OauthConsent"("clientId");

-- CreateIndex
CREATE INDEX "OauthConsent_userId_idx" ON "OauthConsent"("userId");

-- CreateIndex
CREATE INDEX "OauthClientAssertion_expiresAt_idx" ON "OauthClientAssertion"("expiresAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthClient" ADD CONSTRAINT "OauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthClientResource" ADD CONSTRAINT "OauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "OauthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthRefreshToken" ADD CONSTRAINT "OauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthAccessToken" ADD CONSTRAINT "OauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "OauthRefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthConsent" ADD CONSTRAINT "OauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OauthConsent" ADD CONSTRAINT "OauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rename, do not drop: Auth.js's DateTime "emailVerified" becomes "emailVerifiedAt".
ALTER TABLE "User" RENAME COLUMN "emailVerified" TO "emailVerifiedAt";
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "emailVerified" = true WHERE "emailVerifiedAt" IS NOT NULL;

-- Carry Google links across so a Google sign-in lands in the same User (ADR 0071 §2).
INSERT INTO "AuthAccount" ("id", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "scope", "createdAt", "updatedAt")
SELECT "id", "providerAccountId", "provider", "userId", "access_token", "refresh_token", "id_token", "scope", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" WHERE "provider" = 'google';

DROP TABLE "McpToken";
