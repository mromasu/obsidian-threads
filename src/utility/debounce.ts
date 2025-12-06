/**
 * Creates a debounced version of the provided function.
 * The debounced function will delay invoking the original function
 * until after `delay` milliseconds have elapsed since the last call.
 * 
 * @param fn - The function to debounce
 * @param delay - The number of milliseconds to delay
 * @returns A debounced version of the function
 * 
 * @example
 * const debouncedSave = debounce((data) => save(data), 300);
 * debouncedSave(data1); // Will be cancelled
 * debouncedSave(data2); // Will execute after 300ms
 */
export const debounce = <T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: ReturnType<typeof setTimeout>;

    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

/**
 * Creates a throttled version of the provided function.
 * The throttled function will invoke the original function at most once
 * per `delay` milliseconds.
 * 
 * @param fn - The function to throttle
 * @param delay - The minimum time between invocations in milliseconds
 * @returns A throttled version of the function
 */
export const throttle = <T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= delay) {
            lastCall = now;
            fn(...args);
        } else if (!timeoutId) {
            // Schedule a call for the remaining time
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                fn(...args);
            }, delay - timeSinceLastCall);
        }
    };
};
