// Validation constants (match server-side rules)
const EMAIL_REGEX = /^[\w.+\-]+@[\w.\-]+\.\w{2,}$/;
export const NAME_MAX = 50;
export const PASSWORD_MIN = 6;
export const NOTE_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 5000;
export const SEARCH_NAME_MAX = 100;

// Each validator returns '' (valid) or an error message string (invalid)

export const validateEmail = (email) => {
  if (!email || !email.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address';
  return '';
};

export const validateName = (name, label = 'Name') => {
  if (!name || !name.trim()) return `${label} is required`;
  if (name.trim().length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or less`;
  return '';
};

export const validatePassword = (password) => {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  return '';
};

export const validatePasswordMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) return 'Passwords do not match';
  return '';
};

export const validateNoteTitle = (title) => {
  if (!title || !title.trim()) return 'Title is required';
  if (title.trim().length > NOTE_TITLE_MAX) return `Title must be ${NOTE_TITLE_MAX} characters or less`;
  return '';
};

export const validateNoteContent = (content) => {
  if (!content || !content.trim()) return 'Content is required';
  if (content.trim().length > NOTE_CONTENT_MAX) return `Content must be ${NOTE_CONTENT_MAX} characters or less`;
  return '';
};

export const validateSearchName = (name) => {
  if (!name || !name.trim()) return 'Search name is required';
  if (name.trim().length > SEARCH_NAME_MAX) return `Name must be ${SEARCH_NAME_MAX} characters or less`;
  return '';
};

// Document link validation
export const DOC_LINK_MAX = 5;
export const DOC_LABEL_MAX = 100;

export const validateDocUrl = (url) => {
  if (!url || !url.trim()) return 'URL is required';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'URL must use http or https';
  } catch {
    return 'Please enter a valid URL';
  }
  return '';
};
