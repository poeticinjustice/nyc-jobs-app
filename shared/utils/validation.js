const {
  NAME_MAX,
  PASSWORD_MIN,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
  SEARCH_NAME_MAX,
} = require('../constants');

const EMAIL_REGEX = /^[\w.+-]+@[\w.-]+\.\w{2,}$/;

// Each validator returns '' (valid) or an error message string (invalid)

const validateEmail = (email) => {
  if (!email || !email.trim()) return 'Email is required';
  if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address';
  return '';
};

const validateName = (name, label = 'Name') => {
  if (!name || !name.trim()) return `${label} is required`;
  if (name.trim().length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or less`;
  return '';
};

const validatePassword = (password) => {
  if (!password) return 'Password is required';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  return '';
};

const validatePasswordMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) return 'Passwords do not match';
  return '';
};

const validateNoteTitle = (title) => {
  if (!title || !title.trim()) return 'Title is required';
  if (title.trim().length > NOTE_TITLE_MAX) return `Title must be ${NOTE_TITLE_MAX} characters or less`;
  return '';
};

const validateNoteContent = (content) => {
  if (!content || !content.trim()) return 'Content is required';
  if (content.trim().length > NOTE_CONTENT_MAX) return `Content must be ${NOTE_CONTENT_MAX} characters or less`;
  return '';
};

const validateSearchName = (name) => {
  if (!name || !name.trim()) return 'Search name is required';
  if (name.trim().length > SEARCH_NAME_MAX) return `Name must be ${SEARCH_NAME_MAX} characters or less`;
  return '';
};

const validateDocUrl = (url) => {
  if (!url || !url.trim()) return 'URL is required';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'URL must use http or https';
  } catch {
    return 'Please enter a valid URL';
  }
  return '';
};

module.exports = {
  EMAIL_REGEX,
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordMatch,
  validateNoteTitle,
  validateNoteContent,
  validateSearchName,
  validateDocUrl,
};
