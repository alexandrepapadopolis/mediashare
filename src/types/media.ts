export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  media_type: 'photo' | 'video';
  source_type: 'file' | 'url';
  file_path: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  tags: string[];
  category_id: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  category?: Category;
  profiles?: {
    username: string | null;
  };
}

export interface MediaFormData {
  title: string;
  description: string;
  media_type: 'photo' | 'video';
  source_type: 'file' | 'url';
  external_url: string;
  tags: string[];
  category_id: string;
  file?: File;
}
