import { UserModel } from '../models/user.model.js';
import type { User, UserPublic, UserCreateInput } from '../types/index.js';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../middlewares/error.middleware.js';

export class UserService {
  /**
   * Get all users (admin only)
   */
  static getUsers(): UserPublic[] {
    return UserModel.findAll().map(UserModel.toPublic);
  }

  /**
   * Get a specific user
   */
  static getUser(userId: number): UserPublic {
    const user = UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return UserModel.toPublic(user);
  }

  /**
   * Create a new user (admin only)
   */
  static async createUser(input: UserCreateInput): Promise<UserPublic> {
    // Validate username
    if (!input.username || input.username.length < 3) {
      throw new ValidationError('Username must be at least 3 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(input.username)) {
      throw new ValidationError('Username can only contain letters, numbers, underscores, and hyphens');
    }

    // Validate password
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Check if username exists
    if (UserModel.usernameExists(input.username)) {
      throw new ConflictError('Username already exists');
    }

    const user = await UserModel.create(input);
    return UserModel.toPublic(user);
  }

  /**
   * Update a user
   */
  static updateUser(
    userId: number,
    updates: Partial<Pick<User, 'username' | 'is_admin'>>,
    currentUser: User
  ): UserPublic {
    const user = UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Only admins can modify other users
    if (userId !== currentUser.id && !currentUser.is_admin) {
      throw new ForbiddenError('Cannot modify other users');
    }

    // Only admins can change admin status
    if (updates.is_admin !== undefined && !currentUser.is_admin) {
      throw new ForbiddenError('Cannot change admin status');
    }

    // Prevent removing own admin status if you're the last admin
    if (
      updates.is_admin === false &&
      userId === currentUser.id &&
      UserModel.findAll().filter(u => u.is_admin).length === 1
    ) {
      throw new ValidationError('Cannot remove admin status from the last admin');
    }

    // Validate username if updating
    if (updates.username !== undefined) {
      if (updates.username.length < 3) {
        throw new ValidationError('Username must be at least 3 characters');
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(updates.username)) {
        throw new ValidationError('Username can only contain letters, numbers, underscores, and hyphens');
      }

      if (UserModel.usernameExists(updates.username, userId)) {
        throw new ConflictError('Username already exists');
      }
    }

    const updated = UserModel.update(userId, updates);
    if (!updated) {
      throw new NotFoundError('User');
    }

    return UserModel.toPublic(updated);
  }

  /**
   * Update user password
   */
  static async updatePassword(
    userId: number,
    newPassword: string,
    currentUser: User
  ): Promise<void> {
    const user = UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Only admins can change other users' passwords
    if (userId !== currentUser.id && !currentUser.is_admin) {
      throw new ForbiddenError('Cannot change password for other users');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    await UserModel.updatePassword(userId, newPassword);
  }

  /**
   * Delete a user (admin only)
   */
  static deleteUser(userId: number, currentUser: User): boolean {
    const user = UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Cannot delete yourself
    if (userId === currentUser.id) {
      throw new ValidationError('Cannot delete your own account');
    }

    // Prevent deleting the last admin
    if (user.is_admin && UserModel.findAll().filter(u => u.is_admin).length === 1) {
      throw new ValidationError('Cannot delete the last admin');
    }

    return UserModel.delete(userId);
  }

  /**
   * Get user count
   */
  static getUserCount(): number {
    return UserModel.count();
  }
}

export default UserService;

