import type { ImageCreate } from './imageCreate';

export interface SetImport {
  title: string;
  creator_names?: string[];
  local_path?: string | null;
  images?: ImageCreate[];
  notes?: string | null;
}
