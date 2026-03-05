// Re-export validators from shared
export {
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordMatch,
  validateNoteTitle,
  validateNoteContent,
  validateSearchName,
  validateDocUrl,
} from 'nyc-jobs-shared/utils/validation';

// Re-export constants that components import from this path
export {
  NAME_MAX,
  PASSWORD_MIN,
  NOTE_TITLE_MAX,
  NOTE_CONTENT_MAX,
  SEARCH_NAME_MAX,
  DOC_LINK_MAX,
  DOC_LABEL_MAX,
} from 'nyc-jobs-shared/constants';
