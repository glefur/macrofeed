import { UserModel } from '../models/user.model.js';
import type { User, UserPublic } from '../types/index.js';
import { UnauthorizedError, ConflictError, ValidationError } from '../middlewares/error.middleware.js';

export class AuthService {
  /**
   * Authenticate user with username and password
   */
  static async login(
    username: string,
    password: string
  ): Promise<UserPublic> {
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

    return UserModel.toPublic(user);
  }

  /**
   * Register a new user
   */
  static async register(
    username: string,
    password: string,
    isAdmin = false
  ): Promise<UserPublic> {
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

    return UserModel.toPublic(user);
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
}

export default AuthService;
