import { eq } from 'drizzle-orm';
import { AppError, conflict, tooManyRequests, unauthorized } from '../../common/errors.js';
import { uuidv7 } from '../../common/id.js';
import type { Database } from '../../database/client.js';
import { createRefreshSessionsRepository } from '../../database/repositories/refresh-sessions.repository.js';
import { TenantAuditLogsRepository } from '../../database/repositories/tenant-audit-logs.repository.js';
import { tenants, users } from '../../database/schema/index.js';
import type { Principal } from '../authz/principal.js';
import { requireTenantScope } from '../authz/tenant-scope.js';
import type { AccessTokenService } from './access-token.js';
import { createFailureThrottle } from './login-throttle.js';
import { hashPassword, verifyPassword } from './password.js';
import { checkPasswordPolicy } from './password-policy.js';
import type { PasswordIssue } from './password-policy.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

export interface AuthContext {
  ip: string;
  userAgent: string | null;
  /** Correlates audit records with the request log. */
  requestId?: string;
  /** Fastify's request.log satisfies this. Used for security events only (never secrets). */
  log: { warn: (obj: object, msg: string) => void };
}

export interface AuthenticatedUser {
  principal: Principal;
  email: string;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: AuthenticatedUser;
}

export interface AuthServiceDeps {
  db: Database['db'];
  accessTokens: AccessTokenService;
  refreshTtlDays: number;
  /** Test hook. */
  clock?: () => Date;
}

type UserRow = typeof users.$inferSelect;
interface LoadedUser {
  user: UserRow;
  tenantStatus: string | null;
}

const WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const invalidCredentials = () => unauthorized('Invalid email or password');
const invalidSession = () => unauthorized('Invalid or expired session');

export interface RegisterInput {
  companyName: string;
  email: string;
  password: string;
}

const PASSWORD_ISSUE_MESSAGES: Record<PasswordIssue, string> = {
  too_short: 'Password is too short',
  too_long: 'Password is too long',
  too_common: 'Password is too common',
  contains_email: 'Password must not contain your email address',
};

/** MariaDB duplicate-key error, however many wrappers the driver/ORM put around it. */
function isDuplicateEntry(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062) return true;
    current = candidate.cause;
  }
  return false;
}

/** The Principal is built ONLY here, from the database record (ADR-0003 §5, ADR-0004 §2). */
function toPrincipal(user: UserRow): Principal | null {
  if (user.tenantId !== null && user.tenantRole !== null && user.platformRole === null) {
    return { kind: 'tenant', userId: user.id, tenantId: user.tenantId, role: user.tenantRole };
  }
  if (user.tenantId === null && user.platformRole !== null) {
    return { kind: 'platform', userId: user.id, role: user.platformRole };
  }
  return null;
}

/** Active user, and (for company users) an active company. */
function mayAuthenticate({ user, tenantStatus }: LoadedUser): boolean {
  return user.status === 'active' && (user.tenantId === null || tenantStatus === 'active');
}

export function createAuthService(deps: AuthServiceDeps) {
  const { db, accessTokens } = deps;
  const now = deps.clock ?? (() => new Date());
  const sessions = createRefreshSessionsRepository(db);
  // 5 failures per (ip + email) and 30 per email across all IPs, per 15 minutes (ADR-0004 §6).
  const byIpAndEmail = createFailureThrottle({ maxFailures: 5, windowMs: WINDOW_MS });
  const byEmail = createFailureThrottle({ maxFailures: 30, windowMs: WINDOW_MS });
  // Registrations cost an Argon2 hash and create rows: 5 attempts per IP per hour (ADR-0004 §10).
  const registrationsByIp = createFailureThrottle({
    maxFailures: 5,
    windowMs: REGISTRATION_WINDOW_MS,
  });

  async function loadUser(where: ReturnType<typeof eq>): Promise<LoadedUser | null> {
    const [row] = await db
      .select({ user: users, tenantStatus: tenants.status })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where)
      .limit(1);
    return row ?? null;
  }

  function refreshExpiry(): Date {
    return new Date(now().getTime() + deps.refreshTtlDays * 24 * 60 * 60 * 1000);
  }

  async function issueTokens(
    loaded: LoadedUser,
    refresh: { token: string; expiresAt: Date },
  ): Promise<SessionTokens> {
    const principal = toPrincipal(loaded.user);
    if (principal === null) throw invalidSession();
    const access = await accessTokens.sign(loaded.user.id);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt,
      user: { principal, email: loaded.user.email },
    };
  }

  /** Starts a brand-new session family (login, registration). */
  async function openSession(loaded: LoadedUser, ctx: AuthContext): Promise<SessionTokens> {
    const refresh = generateRefreshToken();
    const expiresAt = refreshExpiry();
    await sessions.create({
      userId: loaded.user.id,
      familyId: uuidv7(),
      tokenHash: refresh.tokenHash,
      expiresAt,
      userAgent: ctx.userAgent,
    });
    return issueTokens(loaded, { token: refresh.token, expiresAt });
  }

  return {
    async login(email: string, password: string, ctx: AuthContext): Promise<SessionTokens> {
      const emailKey = email.trim().toLowerCase();
      const ipEmailKey = `${ctx.ip}|${emailKey}`;

      const wait = Math.max(
        byIpAndEmail.retryAfterSeconds(ipEmailKey),
        byEmail.retryAfterSeconds(emailKey),
      );
      if (wait > 0) throw tooManyRequests(wait);

      const loaded = await loadUser(eq(users.email, emailKey));
      // Always verify, even for an unknown account, so timing does not reveal whether it exists.
      const passwordOk = await verifyPassword(loaded?.user.passwordHash ?? null, password);

      if (loaded === null || !passwordOk || !mayAuthenticate(loaded)) {
        byIpAndEmail.recordFailure(ipEmailKey);
        byEmail.recordFailure(emailKey);
        throw invalidCredentials();
      }
      byIpAndEmail.reset(ipEmailKey);
      return openSession(loaded, ctx);
    },

    /**
     * Creates a company and its owner in ONE transaction, then signs the owner in.
     * Role and tenant are fixed here (never taken from the request). Trials/subscriptions are
     * not started here: they need the plan catalog (phase D).
     */
    async register(input: RegisterInput, ctx: AuthContext): Promise<SessionTokens> {
      const email = input.email.trim().toLowerCase();

      const issues = checkPasswordPolicy(input.password, { email });
      if (issues.length > 0) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Request validation failed',
          issues.map((issue) => ({ path: 'password', message: PASSWORD_ISSUE_MESSAGES[issue] })),
        );
      }

      // Counted from here on: only attempts that cost a hash and a transaction.
      const wait = registrationsByIp.retryAfterSeconds(ctx.ip);
      if (wait > 0) throw tooManyRequests(wait);
      registrationsByIp.recordFailure(ctx.ip);

      // Hash BEFORE touching the database so a taken email costs the same time as a free one.
      const passwordHash = await hashPassword(input.password);

      const tenantId = uuidv7();
      const userId = uuidv7();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(tenants).values({ id: tenantId, name: input.companyName.trim() });
          await tx.insert(users).values({
            id: userId,
            email,
            passwordHash,
            tenantId,
            tenantRole: 'owner',
          });
        });
      } catch (error) {
        // Registration needs an explicit answer, so a taken email is visible here. Mitigated by the
        // per-IP limits above; the full fix is email verification (ADR-0004 §10).
        if (isDuplicateEntry(error)) throw conflict('This email is already registered');
        throw error;
      }

      // Audit never blocks or fails a registration (audit_logs has no FKs by design).
      try {
        const scope = requireTenantScope({ kind: 'tenant', userId, tenantId, role: 'owner' });
        await new TenantAuditLogsRepository(db, scope).record({
          action: 'tenant.registered',
          targetType: 'tenant',
          targetId: tenantId,
          ...(ctx.requestId !== undefined && { requestId: ctx.requestId }),
        });
      } catch {
        ctx.log.warn({ event: 'audit_write_failed', tenantId }, 'could not record registration');
      }

      const loaded = await loadUser(eq(users.id, userId));
      if (loaded === null) throw invalidSession();
      return openSession(loaded, ctx);
    },

    async refresh(token: string, ctx: AuthContext): Promise<SessionTokens> {
      const next = generateRefreshToken();
      const expiresAt = refreshExpiry();
      const result = await sessions.rotate(
        hashRefreshToken(token),
        { tokenHash: next.tokenHash, expiresAt, userAgent: ctx.userAgent },
        now(),
      );

      if (result.status === 'reuse_detected') {
        ctx.log.warn(
          { event: 'refresh_token_reuse', userId: result.userId, familyId: result.familyId },
          'refresh token reuse detected: session family revoked',
        );
        throw invalidSession();
      }
      if (result.status === 'invalid') throw invalidSession();

      const loaded = await loadUser(eq(users.id, result.userId));
      if (loaded === null || !mayAuthenticate(loaded)) {
        await sessions.revokeFamily(result.familyId, now());
        throw invalidSession();
      }
      return issueTokens(loaded, { token: next.token, expiresAt });
    },

    /** Idempotent: an unknown or already-revoked token is not an error. */
    async logout(token: string): Promise<void> {
      await sessions.revokeFamilyByTokenHash(hashRefreshToken(token), now());
    },

    /** Resolves a Bearer access token to the current, database-backed identity. */
    async authenticate(accessToken: string): Promise<AuthenticatedUser> {
      const verified = await accessTokens.verify(accessToken);
      const loaded = await loadUser(eq(users.id, verified.userId));
      const principal = loaded === null ? null : toPrincipal(loaded.user);
      if (loaded === null || principal === null || !mayAuthenticate(loaded)) {
        throw unauthorized('Invalid or expired token');
      }
      return { principal, email: loaded.user.email };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
