import type { User } from '../types';

export const canEditUser = (currentUser: User | null, targetUser: User): boolean => {
  if (!currentUser) return false;
  // Super Admin (school is null or has CREATE_SCHOOL) can edit any user
  if (!currentUser.school || currentUser.capabilities.includes('CREATE_SCHOOL')) {
    return true;
  }
  // School Admin (VIEW_SCHOOL_WIDE_CONTROLS) can edit any user in same school
  if (currentUser.capabilities.includes('VIEW_SCHOOL_WIDE_CONTROLS')) {
    return targetUser.school === currentUser.school;
  }
  // Teacher can only edit students they personally created
  if (currentUser.capabilities.includes('CREATE_STUDENT')) {
    return targetUser.created_by === currentUser.id;
  }
  return false;
};
