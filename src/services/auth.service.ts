import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';
import type { User, UserPublic, UserSession } from '../types/index.js';
import { UnauthorizedError, ConflictError, ValidationError } from '../middlewares/error.middleware.js';

export interface LoginResult {
  user: UserPublic;
  session: UserSession;
}

export interface RegisterResult {
  user: UserPublic;
  session: UserSession;
}

export class AuthService {
  /**
   * Authenticate user with username and password
   */
  static async login(
    username: string,
    password: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<LoginResult> {
    const user = UserModel.findByUsername(username);
    
    if (!user) {
      throw new UnauthorizedError('Invalid username or password');
    }

    const isValidPassword = await UserModel.verifyPassword(user, password);
    
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid username or password');
    }

    // Update last login
    UserModel.updateLastLogin(user.id);

    // Create session
    const session = SessionModel.create(user.id, userAgent, ipAddress);

    return {
      user: UserModel.toPublic(user),
      session,
    };
  }

  /**
   * Register a new user
   */
  static async register(
    username: string,
    password: string,
    userAgent?: string,
    ipAddress?: string,
    isAdmin = false
  ): Promise<RegisterResult> {
    // Validate username
    if (!username || username.length < 3) {
      throw new ValidationError('Username must be at least 3 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      throw new ValidationError('Username can only contain letters, numbers, underscores, and hyphens');
    }

    // Validate password
    if (!password || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Check if username exists
    if (UserModel.usernameExists(username)) {
      throw new ConflictError('Username already exists');
    }

    // Create user
    const user = await UserModel.create({
      username,
      password,
      is_admin: isAdmin,
    });

    // Create session
    const session = SessionModel.create(user.id, userAgent, ipAddress);

    return {
      user: UserModel.toPublic(user),
      session,
    };
  }

  /**
   * Logout user by deleting session
   */
  static logout(sessionToken: string): boolean {
    return SessionModel.deleteByToken(sessionToken);
  }

  /**
   * Logout all sessions for a user
   */
  static logoutAll(userId: number): number {
    return SessionModel.deleteByUserId(userId);
  }

  /**
   * Get user's active sessions
   */
  static getSessions(userId: number): UserSession[] {
    return SessionModel.findByUserId(userId);
  }

  /**
   * Delete a specific session
   */
  static deleteSession(sessionId: number, userId: number): boolean {
    const session = SessionModel.findById(sessionId);
    if (!session || session.user_id !== userId) {
      return false;
    }
    return SessionModel.delete(sessionId);
  }

  /**
   * Change user password
   */
  static async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    // Verify current password
    const isValid = await UserModel.verifyPassword(user, currentPassword);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    // Update password
    await UserModel.updatePassword(user.id, newPassword);

    // Optionally: invalidate all other sessions
    // SessionModel.deleteByUserId(user.id);
  }

  /**
   * Create initial admin user if no users exist
   */
  static async createInitialAdmin(username: string, password: string): Promise<User | null> {
    if (UserModel.count() > 0) {
      return null; // Users already exist
    }

    return UserModel.create({
      username,
      password,
      is_admin: true,
    });
  }

  /**
   * Clean up expired sessions
   */
  static cleanupExpiredSessions(): number {
    return SessionModel.deleteExpired();
  }
}

export default AuthService;

