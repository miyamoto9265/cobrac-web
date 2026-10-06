// Checks of object keys built from user input (file names), shared by the S3 helpers and the routes that check names
// before anything is written. Pure, so the routes can use it where tests replace the S3 helpers.

/**
 * True when no path segment of `key` is empty, "." or "..". Only whole segments count: a file name such as
 * `capabilities..v2.xlsx` keeps its dots and is fine (it cannot leave its folder).
 */
export const safeKeySegments = (key: string): boolean => key.split("/").every((s) => s !== "" && s !== "." && s !== "..");
