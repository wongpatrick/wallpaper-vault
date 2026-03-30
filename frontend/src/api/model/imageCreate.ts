export interface ImageCreate {
  filename: string;
  local_path: string;
  phash?: string | null;
  width?: number | null;
  height?: number | null;
  file_size?: number | null;
  aspect_ratio?: number | null;
  aspect_ratio_label?: string | null;
  sort_order?: number | null;
  notes?: string | null;
}
