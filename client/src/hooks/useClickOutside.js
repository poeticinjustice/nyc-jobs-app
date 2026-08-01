import { useEffect, useRef } from 'react';

/**
 * Closes a popover/dropdown when the user clicks outside of it.
 *
 * Returns a ref to attach to the container element. Listeners are only
 * attached while `isActive` is true.
 *
 * @param {boolean} isActive       whether the popover is currently open
 * @param {Function} onOutside     called on an outside mousedown (and on Escape when enabled)
 * @param {Object}  [options]
 * @param {boolean} [options.closeOnEscape=false] also call onOutside when Escape is pressed
 */
const useClickOutside = (isActive, onOutside, { closeOnEscape = false } = {}) => {
  const ref = useRef(null);
  // Keep the latest callback without re-subscribing on every render
  const handlerRef = useRef(onOutside);
  handlerRef.current = onOutside;

  useEffect(() => {
    if (!isActive) return undefined;

    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        handlerRef.current();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handlerRef.current();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    if (closeOnEscape) document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeOnEscape) document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, closeOnEscape]);

  return ref;
};

export default useClickOutside;
