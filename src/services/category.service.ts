import { CategoryModel } from '../models/category.model.js';
import type { Category, CategoryCreateInput, CategoryWithFeedCount } from '../types/index.js';
import { ValidationError, NotFoundError, ConflictError } from '../middlewares/error.middleware.js';

export class CategoryService {
  /**
   * Get all categories for a user with feed counts
   */
  static getCategories(userId: number): CategoryWithFeedCount[] {
    return CategoryModel.findByUserIdWithCounts(userId);
  }

  /**
   * Get a specific category
   */
  static getCategory(categoryId: number, userId: number): Category {
    const category = CategoryModel.findById(categoryId);
    if (!category || category.user_id !== userId) {
      throw new NotFoundError('Category');
    }
    return category;
  }

  /**
   * Create a new category
   */
  static createCategory(userId: number, input: CategoryCreateInput): Category {
    const title = input.title?.trim();

    if (!title || title.length === 0) {
      throw new ValidationError('Category title is required');
    }

    if (title.length > 100) {
      throw new ValidationError('Category title must be less than 100 characters');
    }

    if (CategoryModel.titleExists(userId, title)) {
      throw new ConflictError('Category with this title already exists');
    }

    return CategoryModel.create(userId, { title });
  }

  /**
   * Update a category
   */
  static updateCategory(
    categoryId: number,
    userId: number,
    updates: Partial<CategoryCreateInput>
  ): Category {
    const category = CategoryModel.findById(categoryId);
    if (!category || category.user_id !== userId) {
      throw new NotFoundError('Category');
    }

    if (updates.title !== undefined) {
      const title = updates.title.trim();

      if (!title || title.length === 0) {
        throw new ValidationError('Category title is required');
      }

      if (title.length > 100) {
        throw new ValidationError('Category title must be less than 100 characters');
      }

      if (CategoryModel.titleExists(userId, title, categoryId)) {
        throw new ConflictError('Category with this title already exists');
      }
    }

    const updated = CategoryModel.update(categoryId, userId, updates);
    if (!updated) {
      throw new NotFoundError('Category');
    }

    return updated;
  }

  /**
   * Delete a category
   */
  static deleteCategory(categoryId: number, userId: number): boolean {
    const category = CategoryModel.findById(categoryId);
    if (!category || category.user_id !== userId) {
      throw new NotFoundError('Category');
    }

    try {
      return CategoryModel.delete(categoryId, userId);
    } catch (error) {
      if ((error as Error).message.includes('last category')) {
        throw new ValidationError('Cannot delete the last category');
      }
      throw error;
    }
  }
}

export default CategoryService;

