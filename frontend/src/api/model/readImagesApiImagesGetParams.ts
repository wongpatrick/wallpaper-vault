export type ReadImagesApiImagesGetParams = {
skip?: number;
limit?: number;
search?: string | null;
rating?: string | null;
/**
 * Filter by a single tag (matches image or set tags)
 */
tag?: string | null;
/**
 * Sort field (date_added, file_size, resolution, rating, aspect_ratio, random)
 */
sort_by?: string | null;
/**
 * Sort direction (asc, desc)
 */
sort_dir?: string | null;
};
