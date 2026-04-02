// Database entity types

export type Role = 'owner' | 'admin' | 'member';
export type Visibility = 'private' | 'shared' | 'public';
export type SummaryStatus = 'pending' | 'accepted' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface OrgMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: Role;
  created_at: string;
  // Joined fields
  profile?: Profile;
  organization?: Organization;
}

export interface Note {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  content: string;
  visibility: Visibility;
  tags: string[];
  current_version: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: Profile;
  shares?: NoteShare[];
}

export interface NoteVersion {
  id: string;
  note_id: string;
  version_number: number;
  title: string;
  content: string;
  changed_by: string;
  change_summary: string | null;
  created_at: string;
  // Joined
  changer?: Profile;
}

export interface NoteShare {
  id: string;
  note_id: string;
  user_id: string;
  created_at: string;
  // Joined
  profile?: Profile;
}

export interface FileRecord {
  id: string;
  org_id: string;
  note_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  // Joined
  uploader?: Profile;
}

export interface AISummary {
  id: string;
  note_id: string;
  version_number: number;
  summary: {
    overview: string;
    key_points: string[];
    action_items: string[];
    tags_suggested: string[];
  };
  status: SummaryStatus;
  generated_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface AuditLog {
  id: string;
  org_id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // Joined
  profile?: Profile;
}
